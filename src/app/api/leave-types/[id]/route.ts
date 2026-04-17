import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")
    .optional(),
  isPaid: z.boolean().optional(),
  defaultDays: z.number().int().min(0).max(365).optional(),
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN")
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return {
    orgId: sessionUser.organizationId as string,
    actor: {
      id: sessionUser.id as string,
      email: session.user.email ?? null,
      role: sessionUser.role as string,
    },
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.leaveType.findFirst({
    where: { id, organizationId: auth.orgId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
  }

  const updated = await prisma.leaveType.update({
    where: { id },
    data: parsed.data,
  });

  recordAudit({
    organizationId: auth.orgId,
    action: "leave_type.updated",
    resource: "leave_type",
    resourceId: id,
    actor: auth.actor,
    metadata: { name: updated.name, changes: Object.keys(parsed.data) },
    context: requestAuditContext(request),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const existing = await prisma.leaveType.findFirst({
    where: { id, organizationId: auth.orgId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
  }

  const [requestCount, policyCount] = await Promise.all([
    prisma.leaveRequest.count({ where: { leaveTypeId: id } }),
    prisma.leavePolicy.count({ where: { leaveTypeId: id } }),
  ]);

  if (requestCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${requestCount} leave requests reference this type. Archive it instead or reassign requests first.`,
      },
      { status: 409 }
    );
  }

  if (policyCount > 0) {
    await prisma.leavePolicy.deleteMany({ where: { leaveTypeId: id } });
  }

  await prisma.leaveType.delete({ where: { id } });

  recordAudit({
    organizationId: auth.orgId,
    action: "leave_type.deleted",
    resource: "leave_type",
    resourceId: id,
    actor: auth.actor,
    metadata: { name: existing.name },
    context: requestAuditContext(request),
  });

  return NextResponse.json({ success: true });
}

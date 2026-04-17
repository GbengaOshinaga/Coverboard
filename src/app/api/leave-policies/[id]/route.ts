import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  annualAllowance: z.number().int().min(0).max(365).optional(),
  carryOverMax: z.number().int().min(0).max(365).optional(),
});

async function requireAdminOrg() {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN")
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  return {
    orgId: sessionUser.organizationId as string,
    actor: {
      id: sessionUser.id as string,
      email: session.user.email ?? null,
      role: sessionUser.role as string,
    },
  };
}

async function loadOwnedPolicy(id: string, orgId: string) {
  return prisma.leavePolicy.findFirst({
    where: { id, leaveType: { organizationId: orgId } },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminOrg();
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

  const existing = await loadOwnedPolicy(id, auth.orgId);
  if (!existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const updated = await prisma.leavePolicy.update({
    where: { id },
    data: parsed.data,
    include: {
      leaveType: { select: { id: true, name: true, color: true } },
    },
  });

  recordAudit({
    organizationId: auth.orgId,
    action: "leave_policy.updated",
    resource: "leave_policy",
    resourceId: id,
    actor: auth.actor,
    metadata: {
      leaveType: updated.leaveType.name,
      countryCode: updated.countryCode,
      changes: parsed.data,
    },
    context: requestAuditContext(request),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminOrg();
  if (auth.error) return auth.error;

  const { id } = await params;
  const existing = await loadOwnedPolicy(id, auth.orgId);
  if (!existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  await prisma.leavePolicy.delete({ where: { id } });

  recordAudit({
    organizationId: auth.orgId,
    action: "leave_policy.deleted",
    resource: "leave_policy",
    resourceId: id,
    actor: auth.actor,
    metadata: { countryCode: existing.countryCode },
    context: requestAuditContext(request),
  });

  return NextResponse.json({ success: true });
}

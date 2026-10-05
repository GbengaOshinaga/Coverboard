import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { childrenAccess } from "@/lib/children-server";
import { childSchema } from "@/lib/children-schema";

type Params = { params: Promise<{ id: string; childId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, childId } = await params;
  const access = await childrenAccess(id);
  if ("error" in access) return access.error;

  const parsed = childSchema.partial().safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const existing = await prisma.child.findFirst({ where: { id: childId, userId: id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Child not found" }, { status: 404 });

  await prisma.child.update({
    where: { id: childId },
    data: {
      ...(parsed.data.label !== undefined ? { label: parsed.data.label?.trim() || null } : {}),
      ...(parsed.data.dateOfBirth ? { dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00Z`) } : {}),
      ...(parsed.data.weeksTakenElsewhere !== undefined
        ? { weeksTakenElsewhere: parsed.data.weeksTakenElsewhere }
        : {}),
    },
  });
  await recordAudit({
    organizationId: access.orgId,
    action: "team_member.updated",
    resource: "team_member",
    resourceId: id,
    actor: access.actor,
    metadata: { event: "child.updated", childId },
    context: requestAuditContext(request),
  });
  return NextResponse.json({ id: childId });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id, childId } = await params;
  const access = await childrenAccess(id);
  if ("error" in access) return access.error;

  const child = await prisma.child.findFirst({
    where: { id: childId, userId: id },
    select: {
      id: true,
      _count: { select: { leaveRequests: { where: { status: { in: ["APPROVED", "PENDING"] } } } } },
    },
  });
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });
  // Live leave needs its child to stay checkable; edit instead. Cancelled or
  // rejected leave just loses the link.
  if (child._count.leaveRequests > 0) {
    return NextResponse.json(
      { error: "This child has unpaid parental leave recorded, so they can't be removed. Edit their details instead." },
      { status: 409 }
    );
  }
  await prisma.child.delete({ where: { id: childId } });
  await recordAudit({
    organizationId: access.orgId,
    action: "team_member.updated",
    resource: "team_member",
    resourceId: id,
    actor: access.actor,
    metadata: { event: "child.removed", childId },
    context: requestAuditContext(request),
  });
  return NextResponse.json({ ok: true });
}

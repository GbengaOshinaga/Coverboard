import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { childrenAccess, listChildren } from "@/lib/children-server";
import { childSchema, placedOnError } from "@/lib/children-schema";


export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await childrenAccess(id);
  if ("error" in access) return access.error;
  return NextResponse.json(await listChildren(id));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await childrenAccess(id);
  if ("error" in access) return access.error;

  const parsed = childSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const placedProblem = placedOnError(parsed.data.dateOfBirth, parsed.data.placedOn);
  if (placedProblem) return NextResponse.json({ error: placedProblem }, { status: 400 });
  const child = await prisma.child.create({
    data: {
      userId: id,
      label: parsed.data.label?.trim() || null,
      dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00Z`),
      weeksTakenElsewhere: parsed.data.weeksTakenElsewhere ?? 0,
      placedOn: parsed.data.placedOn ? new Date(`${parsed.data.placedOn}T00:00:00Z`) : null,
      disabilityBenefit: parsed.data.disabilityBenefit ?? false,
    },
    select: { id: true },
  });
  // No child details in the audit trail, just that one was added.
  await recordAudit({
    organizationId: access.orgId,
    action: "team_member.updated",
    resource: "team_member",
    resourceId: id,
    actor: access.actor,
    metadata: { event: "child.added", childId: child.id },
    context: requestAuditContext(request),
  });
  return NextResponse.json({ id: child.id }, { status: 201 });
}

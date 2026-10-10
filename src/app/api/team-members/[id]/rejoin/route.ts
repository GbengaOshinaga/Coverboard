import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { maxAdminsForPlan, maxEmployeesForPlan } from "@/lib/plans";
import { planForLimits } from "@/lib/plan-headcount";

/**
 * Someone who left comes back: their record (and its history) is reused, so
 * they can sign in again. Their working pattern and location are set afresh.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as Record<string, unknown>;
  if (u.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can mark someone as rejoined" }, { status: 403 });
  }
  const orgId = u.organizationId as string;
  const { id } = await params;

  const [target, org, activeCount, adminCount] = await Promise.all([
    prisma.user.findFirst({ where: { id, organizationId: orgId }, select: { name: true, role: true, isActive: true, leftOn: true } }),
    planForLimits(orgId),
    prisma.user.count({ where: { organizationId: orgId, isActive: true } }),
    prisma.user.count({ where: { organizationId: orgId, role: "ADMIN", isActive: true } }),
  ]);
  if (!target) return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  // Still here with a leaving date ahead: cancel the leaving date. Leave and
  // cover already cancelled stay cancelled, and their working pattern needs
  // adding again.
  if (target.isActive && target.leftOn) {
    await prisma.user.update({ where: { id }, data: { leftOn: null } });
    recordAudit({
      organizationId: orgId,
      action: "team_member.updated",
      resource: "team_member",
      resourceId: id,
      actor: { id: u.id as string, email: session.user.email ?? null, role: u.role as string },
      metadata: { event: "team_member.leaving_cancelled", leavingDate: target.leftOn.toISOString().slice(0, 10) },
      context: requestAuditContext(request),
    });
    return NextResponse.json({ success: true, leavingCancelled: true });
  }
  if (target.isActive) return NextResponse.json({ error: `${target.name} is already on the team` }, { status: 409 });
  const max = org ? maxEmployeesForPlan(org.plan) : Infinity;
  if (org && Number.isFinite(max) && activeCount >= max) {
    return NextResponse.json({ error: `${org.label} allows up to ${max} team members. Upgrade to add more.` }, { status: 403 });
  }
  // They come back with the role they left with.
  const maxAdmins = org ? maxAdminsForPlan(org.plan) : Infinity;
  if (org && target.role === "ADMIN" && Number.isFinite(maxAdmins) && adminCount >= maxAdmins) {
    return NextResponse.json(
      { error: `${org.label} allows up to ${maxAdmins} admin user${maxAdmins === 1 ? "" : "s"}. They rejoin as an admin, so change an existing admin to a manager first, or upgrade.` },
      { status: 403 }
    );
  }

  await prisma.user.update({ where: { id }, data: { isActive: true, leftOn: null } });
  recordAudit({
    organizationId: orgId,
    action: "team_member.updated",
    resource: "team_member",
    resourceId: id,
    actor: { id: u.id as string, email: session.user.email ?? null, role: u.role as string },
    metadata: { event: "team_member.rejoined", previouslyLeftOn: target.leftOn?.toISOString().slice(0, 10) ?? null },
    context: requestAuditContext(request),
  });
  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeatureForEnum } from "@/lib/planFeatures";
import { computeAbsenceTrends } from "@/lib/absence-trends";
import { isSicknessLeaveType } from "@/lib/fit-note-alerts";
import { recordReadAudit, requestAuditContext } from "@/lib/audit";
import type { AnyPlan } from "@/lib/plans";

/**
 * Absence trends — Scale tier feature.
 *
 * Returns per-user monthly working-days-of-sickness across the trailing
 * 12 months, sorted by total days descending. Used by the reports page
 * to surface employees whose absence is trending upward before the
 * Bradford score alone would flag them.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  const plan = sessionUser.plan as AnyPlan | undefined;

  if (!hasFeatureForEnum(plan ?? null, "absence_analytics")) {
    return NextResponse.json(
      { error: "Absence trends are available on the Scale plan." },
      { status: 403 }
    );
  }

  const now = new Date();
  const twelveMonthsAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1)
  );

  const [users, leaves] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        workCountry: "GB",
      },
      select: { id: true, name: true, bradfordScore: true },
    }),
    // Pull APPROVED leaves that overlap the trailing-12-month window and
    // filter to sickness types in memory (one regex check is cheaper than
    // joining LeaveType in a complex name-pattern query).
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        endDate: { gte: twelveMonthsAgo },
      },
      select: {
        userId: true,
        startDate: true,
        endDate: true,
        leaveType: { select: { name: true } },
      },
    }),
  ]);

  const sicknessLeaves = leaves
    .filter((l) => isSicknessLeaveType(l.leaveType.name))
    .map((l) => ({
      userId: l.userId,
      startDate: l.startDate,
      endDate: l.endDate,
    }));

  const trends = computeAbsenceTrends(users, sicknessLeaves, { now });

  void recordReadAudit({
    plan: plan ?? null,
    organizationId: orgId,
    action: "compliance_report.viewed",
    resource: "compliance_report",
    actor: {
      id: sessionUser.id as string,
      email: (session.user.email as string | null) ?? null,
      role: userRole,
    },
    metadata: {
      report: "absence-trends",
      usersAnalysed: users.length,
      sicknessLeavesAnalysed: sicknessLeaves.length,
    },
    context: requestAuditContext(request),
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    monthsBack: 12,
    users: trends,
  });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeatureForEnum } from "@/lib/planFeatures";
import {
  selectOverdueFitNotes,
  type SicknessLeaveRow,
} from "@/lib/fit-note-alerts";
import { computeRegionalCover } from "@/lib/regional-cover-analytics";
import { recordReadAudit, requestAuditContext } from "@/lib/audit";
import type { AnyPlan } from "@/lib/plans";

/**
 * Leave operations dashboard endpoint — Scale tier feature.
 *
 * Single landing payload that aggregates "what's happening with leave
 * right now?" — out today, returning this week, pending approvals,
 * overdue fit notes, regions under cover, top Bradford scores. Composes
 * the existing analytics helpers rather than duplicating their logic.
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
      { error: "Leave operations dashboard requires the Scale plan." },
      { status: 403 }
    );
  }

  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);
  const sevenDaysOut = new Date(
    startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000
  );
  const thirteenWeeksAgo = new Date(
    now.getTime() - 13 * 7 * 24 * 60 * 60 * 1000
  );

  const [
    org,
    outToday,
    returningSoon,
    pendingCount,
    pendingOldest,
    pendingSamples,
    sicknessLeaves,
    regions,
    coverLeaves,
    bradfordTop,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { regionsEnabled: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        startDate: { lte: endOfToday },
        endDate: { gte: startOfToday },
      },
      select: {
        id: true,
        endDate: true,
        user: { select: { id: true, name: true } },
        leaveType: { select: { name: true, color: true } },
      },
      orderBy: { endDate: "asc" },
      take: 25,
    }),
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        endDate: { gte: startOfToday, lte: sevenDaysOut },
      },
      select: {
        id: true,
        endDate: true,
        user: { select: { id: true, name: true } },
        leaveType: { select: { name: true, color: true } },
      },
      orderBy: { endDate: "asc" },
      take: 25,
    }),
    prisma.leaveRequest.count({
      where: { user: { organizationId: orgId }, status: "PENDING" },
    }),
    prisma.leaveRequest.findFirst({
      where: { user: { organizationId: orgId }, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.leaveRequest.findMany({
      where: { user: { organizationId: orgId }, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        startDate: true,
        user: { select: { id: true, name: true } },
        leaveType: { select: { name: true } },
      },
      take: 5,
    }),
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        evidenceProvided: false,
        startDate: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        evidenceProvided: true,
        user: { select: { id: true, name: true, email: true } },
        leaveType: { select: { name: true } },
      },
    }),
    prisma.region.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        minCover: true,
        members: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        endDate: { gte: thirteenWeeksAgo },
      },
      select: { userId: true, startDate: true, endDate: true },
    }),
    prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        workCountry: "GB",
        bradfordScore: { gt: 0 },
      },
      select: { id: true, name: true, bradfordScore: true },
      orderBy: { bradfordScore: "desc" },
      take: 5,
    }),
  ]);

  // Overdue fit notes — reuse the existing selector logic.
  const overdueFitNotes = selectOverdueFitNotes(
    sicknessLeaves as SicknessLeaveRow[],
    now
  );

  // Regions under cover this week — reuse the analytics helper but only
  // care about the most recent week (the last entry in weeklySeries).
  let regionsUnderCoverThisWeek: Array<{
    regionId: string;
    name: string;
    daysBelowCover: number;
  }> = [];
  if (org?.regionsEnabled) {
    const coverReport = computeRegionalCover(
      regions.map((r) => ({
        id: r.id,
        name: r.name,
        minCover: r.minCover,
        memberIds: r.members.map((m) => m.id),
      })),
      coverLeaves,
      { now, weeksBack: 1 }
    );
    regionsUnderCoverThisWeek = coverReport
      .filter((r) => r.totalDaysBelowCover > 0)
      .map((r) => ({
        regionId: r.regionId,
        name: r.name,
        daysBelowCover: r.totalDaysBelowCover,
      }));
  }

  const oldestPendingDays = pendingOldest
    ? Math.floor(
        (now.getTime() - pendingOldest.createdAt.getTime()) /
          (24 * 60 * 60 * 1000)
      )
    : 0;

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
    metadata: { report: "leave-operations" },
    context: requestAuditContext(request),
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    headline: {
      outTodayCount: outToday.length,
      returningSoonCount: returningSoon.length,
      pendingCount,
      oldestPendingDays,
      overdueFitNotesCount: overdueFitNotes.length,
      regionsUnderCoverCount: regionsUnderCoverThisWeek.length,
    },
    outToday: outToday.map((l) => ({
      leaveId: l.id,
      userId: l.user.id,
      userName: l.user.name,
      leaveTypeName: l.leaveType.name,
      leaveColor: l.leaveType.color,
      endDate: l.endDate,
    })),
    returningSoon: returningSoon.map((l) => ({
      leaveId: l.id,
      userId: l.user.id,
      userName: l.user.name,
      leaveTypeName: l.leaveType.name,
      leaveColor: l.leaveType.color,
      endDate: l.endDate,
    })),
    pendingSamples: pendingSamples.map((p) => ({
      leaveId: p.id,
      userName: p.user.name,
      leaveTypeName: p.leaveType.name,
      startDate: p.startDate,
      daysWaiting: Math.floor(
        (now.getTime() - p.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      ),
    })),
    overdueFitNotes: overdueFitNotes.slice(0, 5).map((f) => ({
      leaveId: f.leaveId,
      userName: f.userName,
      daysElapsed: f.daysElapsed,
    })),
    regionsUnderCoverThisWeek,
    topBradford: bradfordTop.map((u) => ({
      userId: u.id,
      name: u.name,
      score: Math.round(u.bradfordScore),
    })),
  });
}

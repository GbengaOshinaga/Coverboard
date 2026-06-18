import type { Metadata } from "next";
import Link from "next/link";
import { EmploymentType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserLeaveBalances } from "@/lib/leave-balances";
import { WhoIsOut } from "@/components/dashboard/who-is-out";
import { UpcomingAbsences } from "@/components/dashboard/upcoming-absences";
import { RegionCoverWidget } from "@/components/dashboard/region-cover-widget";
import { ActivationChecklist } from "@/components/dashboard/activation-checklist";
import { ActivationCelebration } from "@/components/dashboard/activation-celebration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarDays, Clock, AlertTriangle, Plus, Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const orgId = (session!.user as Record<string, unknown>).organizationId as string;
  const currentUserId = (session!.user as Record<string, unknown>).id as string;
  const userRole = (session!.user as Record<string, unknown>).role as string;
  const canSeeComplianceAlerts = userRole === "ADMIN" || userRole === "MANAGER";
  const isAdmin = userRole === "ADMIN";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 14);

  // Parallel queries
  const [
    outToday,
    upcoming,
    teamCount,
    pendingCount,
    myBalances,
    rightToWorkRiskCount,
    zeroHoursRightToWorkRiskCount,
    anyRequestCount,
    anyApprovedCount,
  ] = await Promise.all([
    // Who's out today
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        startDate: { lte: endOfToday },
        endDate: { gte: today },
      },
      include: {
        user: { select: { name: true, memberType: true } },
        leaveType: { select: { name: true, color: true } },
      },
      orderBy: { startDate: "asc" },
    }),
    // Upcoming (next 14 days, not including today)
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { gt: endOfToday, lte: nextWeek },
      },
      include: {
        user: { select: { name: true, memberType: true } },
        leaveType: { select: { name: true, color: true } },
      },
      orderBy: { startDate: "asc" },
      take: 10,
    }),
    // Team size
    prisma.user.count({ where: { organizationId: orgId } }),
    // Pending requests
    prisma.leaveRequest.count({
      where: {
        user: { organizationId: orgId },
        status: "PENDING",
      },
    }),
    // Current user's leave balances
    getUserLeaveBalances(currentUserId, today.getFullYear()),
    canSeeComplianceAlerts
      ? prisma.user.count({
          where: {
            organizationId: orgId,
            workCountry: "GB",
            OR: [{ rightToWorkVerified: false }, { rightToWorkVerified: null }],
          },
        })
      : Promise.resolve(0),
    canSeeComplianceAlerts
      ? prisma.user.count({
          where: {
            organizationId: orgId,
            workCountry: "GB",
            employmentType: EmploymentType.ZERO_HOURS,
            OR: [{ rightToWorkVerified: false }, { rightToWorkVerified: null }],
          },
        })
      : Promise.resolve(0),
    // Activation checklist state (admins only): has any request / approval yet.
    isAdmin
      ? prisma.leaveRequest.count({
          where: { user: { organizationId: orgId } },
        })
      : Promise.resolve(0),
    isAdmin
      ? prisma.leaveRequest.count({
          where: { user: { organizationId: orgId }, status: "APPROVED" },
        })
      : Promise.resolve(0),
  ]);

  // First-run activation: show the checklist to admins until the core loop
  // (invite → request → approve) is complete.
  const activationComplete =
    teamCount > 1 && anyRequestCount > 0 && anyApprovedCount > 0;

  const outTodayCount = outToday.length;
  const availableCount = teamCount - outTodayCount;
  const showTeamAbsencesFirst =
    userRole === "ADMIN" || userRole === "MANAGER";

  const absenceCards = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <WhoIsOut
        absences={outToday.map((r: any) => ({
          id: r.id,
          user: { name: r.user.name, memberType: r.user.memberType },
          leaveType: r.leaveType,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
        }))}
      />
      <UpcomingAbsences
        absences={upcoming.map((r: any) => ({
          id: r.id,
          user: { name: r.user.name, memberType: r.user.memberType },
          leaveType: r.leaveType,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          status: r.status,
        }))}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Team overview for{" "}
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <Link
          href="/requests/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Request time off
        </Link>
      </div>

      {isAdmin && !activationComplete && (
        <ActivationChecklist
          team={teamCount > 1}
          request={anyRequestCount > 0}
          approve={anyApprovedCount > 0}
        />
      )}

      {isAdmin && activationComplete && <ActivationCelebration />}

      {showTeamAbsencesFirst && absenceCards}

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Team size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-500" />
              <span className="text-2xl font-bold">{teamCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Available today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{availableCount}</span>
              <span className="text-sm text-gray-400">/ {teamCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Out today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-400" />
              <span className="text-2xl font-bold">{outTodayCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Pending requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">{pendingCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Personal leave lives on "My time off" now — nudge through to it. */}
      <Link href="/my-time-off" className="block">
        <Card className="transition-colors hover:border-brand-200">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 shrink-0 text-brand-500" />
              <p className="text-sm text-gray-700">
                {(() => {
                  const annual = myBalances.find((b) =>
                    /annual/i.test(b.leaveTypeName)
                  );
                  return typeof annual?.remaining === "number" ? (
                    <>
                      You have{" "}
                      <span className="font-semibold text-gray-900">
                        {annual.remaining} day
                        {annual.remaining === 1 ? "" : "s"}
                      </span>{" "}
                      of annual leave left.
                    </>
                  ) : (
                    "View your leave balance and request time off."
                  );
                })()}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium text-brand-600">
              My time off →
            </span>
          </CardContent>
        </Card>
      </Link>

      {canSeeComplianceAlerts && rightToWorkRiskCount > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-1 py-3 text-sm text-amber-800">
            <p>
              UK compliance warning: {rightToWorkRiskCount} team member(s) have
              missing right-to-work verification.
            </p>
            {zeroHoursRightToWorkRiskCount > 0 && (
              <p className="font-medium">
                Right to work verification is especially important for
                zero-hours and bank staff.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <RegionCoverWidget organizationId={orgId} today={today} />

      {!showTeamAbsencesFirst && absenceCards}
    </div>
  );
}

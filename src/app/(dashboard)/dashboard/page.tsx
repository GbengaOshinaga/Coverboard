import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserLeaveBalances } from "@/lib/leave-balances";
import { WhoIsOut } from "@/components/dashboard/who-is-out";
import { UpcomingAbsences } from "@/components/dashboard/upcoming-absences";
import { LeaveBalances } from "@/components/dashboard/leave-balances";
import { RegionCoverWidget } from "@/components/dashboard/region-cover-widget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarDays, Clock, AlertTriangle } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const orgId = (session!.user as Record<string, unknown>).organizationId as string;
  const currentUserId = (session!.user as Record<string, unknown>).id as string;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 14);

  // Parallel queries
  const [outToday, upcoming, teamCount, pendingCount, myBalances, rightToWorkRiskCount] = await Promise.all([
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
    prisma.user.count({
      where: {
        organizationId: orgId,
        countryCode: "GB",
        OR: [{ rightToWorkVerified: false }, { rightToWorkVerified: null }],
      },
    }),
  ]);

  const outTodayCount = outToday.length;
  const availableCount = teamCount - outTodayCount;

  return (
    <div className="space-y-6">
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

      {/* Leave balances */}
      <LeaveBalances balances={myBalances} />

      {rightToWorkRiskCount > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-800">
            UK compliance warning: {rightToWorkRiskCount} team member(s) have missing right-to-work verification.
          </CardContent>
        </Card>
      )}

      <RegionCoverWidget organizationId={orgId} today={today} />

      {/* Main content */}
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
    </div>
  );
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countWeekdays } from "@/lib/utils";

/**
 * Absence analytics across the org. Returns:
 * - monthlyTrend: weekday count of absence per month for the requested year
 * - leaveTypeBreakdown: total weekdays per leave type for the year
 * - departmentBreakdown: total weekdays per department for the year
 * - avgDaysPerEmployee: total absence weekdays / employee count
 * - yearOverYear: previous year totals for comparison
 * - topAbsenceUsers: top 10 employees by absence days this year
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
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const prevStart = new Date(year - 1, 0, 1);
  const prevEnd = new Date(year - 1, 11, 31, 23, 59, 59, 999);

  const [requests, prevRequests, employeeCount] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      include: {
        user: { select: { id: true, name: true, department: true } },
        leaveType: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        startDate: { lte: prevEnd },
        endDate: { gte: prevStart },
      },
      select: { startDate: true, endDate: true },
    }),
    prisma.user.count({ where: { organizationId: orgId } }),
  ]);

  const monthlyTotals = Array.from({ length: 12 }, () => 0);
  const leaveTypeTotals = new Map<
    string,
    { name: string; color: string; days: number }
  >();
  const departmentTotals = new Map<string, number>();
  const userTotals = new Map<string, { name: string; days: number }>();
  let totalDays = 0;

  for (const req of requests) {
    const start = req.startDate < yearStart ? yearStart : req.startDate;
    const end = req.endDate > yearEnd ? yearEnd : req.endDate;
    const days = countWeekdays(start, end);
    if (days <= 0) continue;
    totalDays += days;

    const month = start.getMonth();
    monthlyTotals[month] += days;

    const ltKey = req.leaveType.id;
    const existing = leaveTypeTotals.get(ltKey);
    if (existing) {
      existing.days += days;
    } else {
      leaveTypeTotals.set(ltKey, {
        name: req.leaveType.name,
        color: req.leaveType.color,
        days,
      });
    }

    const dept = req.user.department ?? "(none)";
    departmentTotals.set(dept, (departmentTotals.get(dept) ?? 0) + days);

    const userKey = req.user.id;
    const u = userTotals.get(userKey);
    if (u) {
      u.days += days;
    } else {
      userTotals.set(userKey, { name: req.user.name, days });
    }
  }

  let prevTotalDays = 0;
  for (const r of prevRequests) {
    const start = r.startDate < prevStart ? prevStart : r.startDate;
    const end = r.endDate > prevEnd ? prevEnd : r.endDate;
    prevTotalDays += countWeekdays(start, end);
  }

  const monthLabels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return NextResponse.json({
    year,
    totalDays,
    employeeCount,
    avgDaysPerEmployee:
      employeeCount > 0 ? Number((totalDays / employeeCount).toFixed(1)) : 0,
    monthlyTrend: monthLabels.map((label, i) => ({
      month: label,
      days: monthlyTotals[i],
    })),
    leaveTypeBreakdown: Array.from(leaveTypeTotals.values()).sort(
      (a, b) => b.days - a.days
    ),
    departmentBreakdown: Array.from(departmentTotals.entries())
      .map(([department, days]) => ({ department, days }))
      .sort((a, b) => b.days - a.days),
    topAbsenceUsers: Array.from(userTotals.values())
      .sort((a, b) => b.days - a.days)
      .slice(0, 10),
    yearOverYear: {
      previousYearDays: prevTotalDays,
      changeDays: totalDays - prevTotalDays,
      changePercent:
        prevTotalDays > 0
          ? Number(
              (((totalDays - prevTotalDays) / prevTotalDays) * 100).toFixed(1)
            )
          : null,
    },
  });
}

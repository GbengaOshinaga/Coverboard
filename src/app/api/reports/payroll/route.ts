import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countWeekdays } from "@/lib/utils";
import { getDailyHolidayPayRateForUser, isAnnualLeaveType } from "@/lib/holidayPay";
import {
  getCurrentSMPPhase,
  isMaternityLeaveType,
} from "@/lib/smpCalculator";
import { buildPayrollHolidayRateFields } from "@/lib/payroll-export";

/**
 * Payroll export for a given date range.
 *
 * Each approved leave day is assigned a daily holiday pay rate — either
 * the rate captured on the leave request at approval time (preferred,
 * since it reflects the legally correct 52-week average at the moment
 * the leave was booked) or a live recalculation for annual-leave
 * requests where the rate was never persisted (older data).
 *
 * For non-annual leave the rate is emitted as `null` so payroll knows to
 * fall back to its own rules (e.g. SSP flat weekly rate, SMP schedule).
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

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const from = searchParams.get("from")
    ? new Date(searchParams.get("from") as string)
    : defaultStart;
  const to = searchParams.get("to")
    ? new Date(searchParams.get("to") as string)
    : defaultEnd;

  const requests = await prisma.leaveRequest.findMany({
    where: {
      user: { organizationId: orgId },
      status: "APPROVED",
      startDate: { lte: to },
      endDate: { gte: from },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          countryCode: true,
          workCountry: true,
          employmentType: true,
        },
      },
      leaveType: {
        select: { name: true, isPaid: true, category: true },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Cache live rate lookups per user so we don't hit the DB 20× if a user
  // has multiple historical annual-leave requests without a stored rate.
  const liveRateCache = new Map<string, number | null>();
  async function liveRate(userId: string): Promise<number | null> {
    if (liveRateCache.has(userId)) return liveRateCache.get(userId)!;
    const rate = await getDailyHolidayPayRateForUser(userId);
    liveRateCache.set(userId, rate);
    return rate;
  }

  const referenceDate = to < new Date() ? to : new Date();

  const rows = await Promise.all(
    requests.map(async (r) => {
      const daysTaken = countWeekdays(
        r.startDate > from ? r.startDate : from,
        r.endDate < to ? r.endDate : to
      );

      const isAnnual = isAnnualLeaveType(r.leaveType.name);
      const isUkBased = r.user.workCountry === "GB";
      // Prisma Decimal → number, preserving null when absent.
      let dailyRate: number | null =
        r.dailyHolidayPayRate === null
          ? null
          : Number(r.dailyHolidayPayRate);

      if (dailyRate === null && isAnnual && isUkBased) {
        dailyRate = await liveRate(r.userId);
      }

      const estimatedPay =
        isUkBased && dailyRate !== null
          ? Number((dailyRate * daysTaken).toFixed(2))
          : null;

      // Maternity rows get SMP phase data so payroll can apply the
      // correct weekly rate for each payslip in the export period.
      const smp = isMaternityLeaveType(r.leaveType.name)
        ? getCurrentSMPPhase({
            startDate: r.startDate,
            phase1EndDate: r.smpPhase1EndDate,
            phase2EndDate: r.smpPhase2EndDate,
            phase1Weekly:
              r.smpPhase1WeeklyRate === null
                ? null
                : Number(r.smpPhase1WeeklyRate),
            phase2Weekly:
              r.smpPhase2WeeklyRate === null
                ? null
                : Number(r.smpPhase2WeeklyRate),
            referenceDate,
          })
        : null;

      return {
        leaveRequestId: r.id,
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        department: r.user.department,
        countryCode: r.user.countryCode,
        employmentType: r.user.employmentType,
        leaveType: r.leaveType.name,
        leaveCategory: r.leaveType.category,
        isPaid: r.leaveType.isPaid,
        startDate: r.startDate,
        endDate: r.endDate,
        daysTaken,
        ...buildPayrollHolidayRateFields({
          isUkBased,
          dailyRate,
          estimatedPay,
          rateSource:
            r.dailyHolidayPayRate !== null
              ? "captured_at_booking"
              : isAnnual && dailyRate !== null
                ? "recalculated"
                : "not_applicable",
        }),
        smp: smp
          ? {
              phase: smp.phase,
              label: smp.label,
              weeklyRate: smp.weeklyRate,
              averageWeeklyEarnings:
                r.smpAverageWeeklyEarnings === null
                  ? null
                  : Number(r.smpAverageWeeklyEarnings),
              phase1EndDate: smp.phase1EndDate,
              phase2EndDate: smp.phase2EndDate,
              phase1WeeklyRate:
                r.smpPhase1WeeklyRate === null
                  ? null
                  : Number(r.smpPhase1WeeklyRate),
              phase2WeeklyRate:
                r.smpPhase2WeeklyRate === null
                  ? null
                  : Number(r.smpPhase2WeeklyRate),
            }
          : null,
      };
    })
  );

  const totals = {
    rowCount: rows.length,
    totalDays: rows.reduce((s, r) => s + r.daysTaken, 0),
    totalEstimatedPay: Number(
      rows.reduce((s, r) => s + (r.estimatedPay ?? 0), 0).toFixed(2)
    ),
  };

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
    totals,
  });
}

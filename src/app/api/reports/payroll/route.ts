import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countWorkingDays, type WorkingWeek } from "@/lib/working-week";
import { getWorkingWeek } from "@/lib/working-week-server";
import { sspDaysInPeriod } from "@/lib/ssp-period";
import { birthPayKind, smpPayInPeriod } from "@/lib/smp-dates";
import { computeShpp, computeSncp, computeSpp, isSharedParentalLeaveType } from "@/lib/smp-request";
import { sspRateFor } from "@/lib/leave-requests/ssp-spell";
import { isSspAbsence } from "@/lib/ssp-scope";
import { sspPay } from "@/lib/uk-compliance";
import {
  getDailyHolidayPayRateForUser,
  getHourlyHolidayPayRateForUser,
  isAnnualLeaveType,
} from "@/lib/holidayPay";
import { weeklyStatutoryPayFor } from "@/lib/smpCalculator";
import {
  isNeonatalCareLeaveType,
} from "@/lib/neonatalPay";
import { buildPayrollHolidayRateFields } from "@/lib/payroll-export";
import {
  parseExportFormat,
  toCsv,
  toExcel,
  EXPORT_CONTENT_TYPE,
  exportFilename,
} from "@/lib/export-formats";
import { PAYROLL_EXPORT_COLUMNS, type PayrollReport, type PayrollRow } from "@/lib/payroll-columns";

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
  // A malformed date (e.g. "garbage") yields an Invalid Date, which Prisma
  // rejects with an opaque 500. Validate before querying and return a clear
  // 400 instead.
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json(
      { error: "Invalid 'from' or 'to' date parameter" },
      { status: 400 }
    );
  }

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
          workCountry: true,
          employmentType: true,
          averageWeeklyEarnings: true,
          serviceStartDate: true,
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

  // Irregular/zero-hours workers are paid by the hour, so their holiday pay uses
  // an hourly rate (52-week earnings ÷ hours) applied to the hours booked.
  const hourlyRateCache = new Map<string, number | null>();
  async function hourlyRate(userId: string): Promise<number | null> {
    if (hourlyRateCache.has(userId)) return hourlyRateCache.get(userId)!;
    const rate = await getHourlyHolidayPayRateForUser(userId);
    hourlyRateCache.set(userId, rate);
    return rate;
  }


  // Days are counted on the person's working week as it was when the absence
  // started (a 3-day worker off for a fortnight has 6 days, not 10) — the
  // same week its SSP and holiday pay were worked out on.
  const workingWeekCache = new Map<string, Promise<WorkingWeek>>();
  function workingWeek(userId: string, onDate: Date): Promise<WorkingWeek> {
    const key = `${userId}:${onDate.toISOString()}`;
    if (!workingWeekCache.has(key)) {
      workingWeekCache.set(key, getWorkingWeek(userId, onDate));
    }
    return workingWeekCache.get(key)!;
  }

  const rows = await Promise.all(
    requests.map(async (request): Promise<PayrollRow> => {
      const week = await workingWeek(request.userId, request.startDate);
      const daysTaken = countWorkingDays(
        request.startDate > from ? request.startDate : from,
        request.endDate < to ? request.endDate : to,
        week.weekdays
      );

      const isAnnual = isAnnualLeaveType(request.leaveType.name);
      const isUkBased = request.user.workCountry === "GB";

      // Hours-booked annual leave (irregular/zero-hours workers): pay is the
      // hourly rate × hours, not a daily rate × days.
      const hoursTaken = request.hoursBooked ?? null;
      const isHoursRow = hoursTaken !== null && isAnnual && isUkBased;

      // Prisma Decimal → number, preserving null when absent.
      let dailyRate: number | null =
        request.dailyHolidayPayRate === null
          ? null
          : Number(request.dailyHolidayPayRate);

      if (dailyRate === null && isAnnual && isUkBased && !isHoursRow) {
        dailyRate = await liveRate(request.userId);
      }

      const hourly = isHoursRow ? await hourlyRate(request.userId) : null;

      const estimatedPay = isHoursRow
        ? hourly !== null
          ? Number((hourly * (hoursTaken as number)).toFixed(2))
          : null
        : isUkBased && dailyRate !== null
          ? Number((dailyRate * daysTaken).toFixed(2))
          : null;

      // Maternity rows get SMP phase data so payroll can apply the
      // correct weekly rate for each payslip in the export period.
      // SMP for the days of this pay period (not today's phase): calendar
      // days at the weekly rate ÷ 7, split across the 90% and flat-rate weeks.
      // SMP (maternity) or SAP (adoption): the same phases and rates.
      const payKind = birthPayKind(request.leaveType.name);
      const smpPhases =
        payKind && request.smpPhase1EndDate && request.smpPhase2EndDate
          ? { phase1End: request.smpPhase1EndDate, phase2End: request.smpPhase2EndDate }
          : null;
      const smpPeriod = smpPhases
        ? smpPayInPeriod({
            leaveStart: request.startDate,
            leaveEnd: request.endDate,
            phase1End: smpPhases.phase1End,
            phase2End: smpPhases.phase2End,
            phase1Weekly: request.smpPhase1WeeklyRate === null ? null : Number(request.smpPhase1WeeklyRate),
            phase2Weekly: request.smpPhase2WeeklyRate === null ? null : Number(request.smpPhase2WeeklyRate),
            from,
            to,
          })
        : null;

      // Neonatal Care Pay: a single weekly rate (lower of flat or 90% AWE) for
      // up to 12 weeks. Computed live from the employee's AWE; weeks-in-period
      // is the working days taken ÷ the days they work in a week.
      // Statutory Neonatal Care Pay: calendar days in these dates at the
      // weekly rate ÷ 7, the rate from the right week (src/lib/smp-request.ts).
      const neonatal =
        isNeonatalCareLeaveType(request.leaveType.name) && isUkBased
          ? await (async () => {
              const a = request.startDate > from ? request.startDate : from;
              const b = request.endDate < to ? request.endDate : to;
              const calendarDays = b < a ? 0 : Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
              const pay = await computeSncp({
                userId: request.userId,
                startDate: request.startDate,
                expectedDueDate: request.expectedDueDate,
                matchedDate: request.matchedDate,
                childBirthDate: request.childBirthDate,
                careFirstDay: request.neonatalCareFirstDay,
              });
              return {
                weeklyRate: pay.weeklyRate,
                calendarDays,
                pay: pay.weeklyRate === null ? null : weeklyStatutoryPayFor(pay.weeklyRate, calendarDays),
                basis: pay.basis,
              };
            })()
          : null;

      return {
        leaveRequestId: request.id,
        userId: request.userId,
        name: request.user.name,
        email: request.user.email,
        department: request.user.department,
        workCountry: request.user.workCountry,
        employmentType: request.user.employmentType,
        leaveType: request.leaveType.name,
        leaveCategory: request.leaveType.category,
        isPaid: request.leaveType.isPaid,
        startDate: request.startDate.toISOString(),
        endDate: request.endDate.toISOString(),
        daysTaken,
        calendarDays: (() => {
          const a = request.startDate > from ? request.startDate : from;
          const b = request.endDate < to ? request.endDate : to;
          return b < a ? 0 : Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
        })(),
        hoursTaken,
        hourlyRate: hourly,
        ...buildPayrollHolidayRateFields({
          isUkBased,
          dailyRate,
          estimatedPay,
          rateSource: isHoursRow
            ? hourly !== null
              ? "recalculated"
              : "not_applicable"
            : request.dailyHolidayPayRate !== null
              ? "captured_at_booking"
              : isAnnual && dailyRate !== null
                ? "recalculated"
                : "not_applicable",
        }),
        smp: smpPeriod && smpPhases && payKind
          ? {
              kind: payKind,
              phase:
                smpPeriod.phase1Days > 0 ? "phase_1" : smpPeriod.phase2Days > 0 ? "phase_2" : "ended",
              label:
                smpPeriod.phase1Days > 0 && smpPeriod.phase2Days > 0
                  ? "6 weeks at 90%, then flat rate"
                  : smpPeriod.phase1Days > 0
                    ? "First 6 weeks (90%)"
                    : smpPeriod.phase2Days > 0
                      ? "Weeks 7–39 (flat rate)"
                      : "Outside the SMP weeks",
              weeklyRate:
                smpPeriod.phase1Days > 0
                  ? request.smpPhase1WeeklyRate === null ? null : Number(request.smpPhase1WeeklyRate)
                  : request.smpPhase2WeeklyRate === null ? null : Number(request.smpPhase2WeeklyRate),
              daysInPeriod: smpPeriod.phase1Days + smpPeriod.phase2Days,
              pay: smpPeriod.pay,
              averageWeeklyEarnings:
                request.smpAverageWeeklyEarnings === null
                  ? null
                  : Number(request.smpAverageWeeklyEarnings),
              phase1EndDate: smpPhases.phase1End.toISOString(),
              phase2EndDate: smpPhases.phase2End.toISOString(),
              phase1WeeklyRate:
                request.smpPhase1WeeklyRate === null
                  ? null
                  : Number(request.smpPhase1WeeklyRate),
              phase2WeeklyRate:
                request.smpPhase2WeeklyRate === null
                  ? null
                  : Number(request.smpPhase2WeeklyRate),
            }
          : null,
        neonatal,
        // Statutory Shared Parental Pay for the blocks their notice claims pay
        // for: the same weekly rate every week, 7 calendar days a week.
        shpp:
          isUkBased && isSharedParentalLeaveType(request.leaveType.name)
            ? await (async () => {
                const periodStart = request.startDate > from ? request.startDate : from;
                const periodEnd = request.endDate < to ? request.endDate : to;
                const calendarDays =
                  periodEnd < periodStart
                    ? 0
                    : Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
                if (!request.shppClaimed) {
                  return { weeklyRate: null, calendarDays, pay: 0, basis: "Unpaid shared parental leave: no ShPP claimed for these weeks" };
                }
                const pay = await computeShpp({
                  userId: request.userId,
                  startDate: request.startDate,
                  expectedDueDate: request.matchedDate ? null : request.expectedDueDate,
                  matchedDate: request.matchedDate,
                });
                return {
                  weeklyRate: pay.weeklyRate,
                  calendarDays,
                  pay: pay.weeklyRate === null ? null : weeklyStatutoryPayFor(pay.weeklyRate, calendarDays),
                  basis: pay.basis,
                };
              })()
            : null,
        // Statutory Paternity Pay for the paternity leave in these dates: a
        // weekly payment for 7 calendar days a week.
        spp:
          isUkBased && /paternity/i.test(request.leaveType.name)
            ? await (async () => {
                // Earnings from the 8 weeks up to the qualifying (or matching)
                // week, not before the leave (src/lib/smp-request.ts).
                const pay = await computeSpp({
                  userId: request.userId,
                  startDate: request.startDate,
                  expectedDueDate: request.expectedDueDate,
                  matchedDate: request.matchedDate,
                  childBirthDate: request.childBirthDate,
                });
                const periodStart = request.startDate > from ? request.startDate : from;
                const periodEnd = request.endDate < to ? request.endDate : to;
                const calendarDays =
                  periodEnd < periodStart
                    ? 0
                    : Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
                return {
                  weeklyRate: pay.weeklyRate,
                  calendarDays,
                  pay: pay.weeklyRate === null ? null : weeklyStatutoryPayFor(pay.weeklyRate, calendarDays),
                  basis: pay.basis,
                };
              })()
            : null,
        ssp: isSspAbsence(request.leaveType.name, request.user.workCountry)
          ? await (async () => {
              const days = sspDaysInPeriod({
                startDate: request.startDate,
                endDate: request.endDate,
                sspDaysPaid: request.sspDaysPaid,
                weekdays: week.weekdays,
                from,
                to,
              });
              // Stored at booking; worked out now for absences booked before
              // rates were stored, so payroll always has a figure to pay.
              const rate = await sspRateFor(request);
              const dailyRate = rate?.dailyRate ?? null;
              return {
                daysInPeriod: days,
                dailyRate,
                pay: dailyRate === null ? null : sspPay(days, dailyRate, week.daysPerWeek),
                averageWeeklyEarnings: rate?.averageWeeklyEarnings ?? null,
                basis: rate?.basis ?? null,
              };
            })()
          : null,
      };
    })
  );

  const totals = {
    rowCount: rows.length,
    totalDays: rows.reduce((s, r) => s + r.daysTaken, 0),
    totalHours: Number(
      rows.reduce((s, r) => s + (r.hoursTaken ?? 0), 0).toFixed(2)
    ),
    totalEstimatedPay: Number(
      rows.reduce((s, r) => s + (r.estimatedPay ?? 0), 0).toFixed(2)
    ),
    totalSspPay: Number(rows.reduce((s, r) => s + (r.ssp?.pay ?? 0), 0).toFixed(2)),
    totalSppPay: Number(rows.reduce((s, r) => s + (r.spp?.pay ?? 0), 0).toFixed(2)),
    totalShppPay: Number(rows.reduce((s, r) => s + (r.shpp?.pay ?? 0), 0).toFixed(2)),
    totalNeonatalPay: Number(rows.reduce((s, r) => s + (r.neonatal?.pay ?? 0), 0).toFixed(2)),
    totalSmpPay: Number(rows.reduce((s, r) => s + (r.smp?.kind === "SMP" ? (r.smp.pay ?? 0) : 0), 0).toFixed(2)),
    totalSapPay: Number(rows.reduce((s, r) => s + (r.smp?.kind === "SAP" ? (r.smp.pay ?? 0) : 0), 0).toFixed(2)),
  };

  const format = parseExportFormat(searchParams.get("format"));
  if (format === "json") {
    const report: PayrollReport = {
      from: from.toISOString(),
      to: to.toISOString(),
      rows,
      totals,
    };
    return NextResponse.json(report);
  }

  // Columns (and the row shape) live in payroll-columns so the API and the
  // Reports page can't drift apart. Nested SMP/neonatal blocks are flattened
  // there, since payroll software won't read a JSON object inside a cell.
  const columns = PAYROLL_EXPORT_COLUMNS;

  const filename = exportFilename(
    `coverboard-payroll-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}`,
    format,
    new Date()
  );

  if (format === "csv") {
    const body = toCsv(rows, columns);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPE.csv,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Excel
  const buffer = await toExcel([
    {
      name: "Payroll",
      columns,
      rows,
    },
  ]);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": EXPORT_CONTENT_TYPE.excel,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

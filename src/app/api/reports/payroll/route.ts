import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countWeekdays } from "@/lib/utils";
import {
  getDailyHolidayPayRateForUser,
  getHourlyHolidayPayRateForUser,
  isAnnualLeaveType,
} from "@/lib/holidayPay";
import {
  getCurrentSMPPhase,
  isMaternityLeaveType,
} from "@/lib/smpCalculator";
import { buildPayrollHolidayRateFields } from "@/lib/payroll-export";
import {
  parseExportFormat,
  toCsv,
  toExcel,
  EXPORT_CONTENT_TYPE,
  exportFilename,
  type ExportColumn,
} from "@/lib/export-formats";

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

  // Irregular/zero-hours workers are paid by the hour, so their holiday pay uses
  // an hourly rate (52-week earnings ÷ hours) applied to the hours booked.
  const hourlyRateCache = new Map<string, number | null>();
  async function hourlyRate(userId: string): Promise<number | null> {
    if (hourlyRateCache.has(userId)) return hourlyRateCache.get(userId)!;
    const rate = await getHourlyHolidayPayRateForUser(userId);
    hourlyRateCache.set(userId, rate);
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

      // Hours-booked annual leave (irregular/zero-hours workers): pay is the
      // hourly rate × hours, not a daily rate × days.
      const hoursTaken = r.hoursBooked ?? null;
      const isHoursRow = hoursTaken !== null && isAnnual && isUkBased;

      // Prisma Decimal → number, preserving null when absent.
      let dailyRate: number | null =
        r.dailyHolidayPayRate === null
          ? null
          : Number(r.dailyHolidayPayRate);

      if (dailyRate === null && isAnnual && isUkBased && !isHoursRow) {
        dailyRate = await liveRate(r.userId);
      }

      const hourly = isHoursRow ? await hourlyRate(r.userId) : null;

      const estimatedPay = isHoursRow
        ? hourly !== null
          ? Number((hourly * (hoursTaken as number)).toFixed(2))
          : null
        : isUkBased && dailyRate !== null
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
            : r.dailyHolidayPayRate !== null
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
    totalHours: Number(
      rows.reduce((s, r) => s + (r.hoursTaken ?? 0), 0).toFixed(2)
    ),
    totalEstimatedPay: Number(
      rows.reduce((s, r) => s + (r.estimatedPay ?? 0), 0).toFixed(2)
    ),
  };

  const format = parseExportFormat(searchParams.get("format"));
  if (format === "json") {
    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      rows,
      totals,
    });
  }

  // Flatten the nested SMP block into top-level columns for tabular export —
  // payroll software won't read a JSON sub-object inside a CSV cell.
  type PayrollRow = (typeof rows)[number];
  const columns: ExportColumn<PayrollRow>[] = [
    { key: "leaveRequestId", header: "Leave request ID" },
    { key: "userId", header: "Employee ID" },
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "department", header: "Department" },
    { key: "countryCode", header: "Country" },
    { key: "employmentType", header: "Employment type" },
    { key: "leaveType", header: "Leave type" },
    { key: "leaveCategory", header: "Category" },
    { key: "isPaid", header: "Paid" },
    {
      key: (r) =>
        r.startDate instanceof Date ? r.startDate.toISOString() : r.startDate,
      header: "Start date",
    },
    {
      key: (r) =>
        r.endDate instanceof Date ? r.endDate.toISOString() : r.endDate,
      header: "End date",
    },
    { key: "daysTaken", header: "Days taken" },
    {
      key: (r) => (r as Record<string, unknown>).hoursTaken ?? null,
      header: "Hours taken",
    },
    {
      key: (r) => (r as Record<string, unknown>).dailyHolidayPayRate ?? null,
      header: "Daily rate (£)",
    },
    {
      key: (r) => (r as Record<string, unknown>).hourlyRate ?? null,
      header: "Hourly rate (£)",
    },
    {
      key: (r) => (r as Record<string, unknown>).estimatedPay ?? null,
      header: "Estimated pay (£)",
    },
    {
      key: (r) => (r as Record<string, unknown>).rateSource ?? null,
      header: "Rate source",
    },
    {
      key: (r) => r.smp?.phase ?? null,
      header: "SMP phase",
    },
    {
      key: (r) => r.smp?.weeklyRate ?? null,
      header: "SMP weekly rate (£)",
    },
    {
      key: (r) => r.smp?.averageWeeklyEarnings ?? null,
      header: "AWE (£)",
    },
  ];

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

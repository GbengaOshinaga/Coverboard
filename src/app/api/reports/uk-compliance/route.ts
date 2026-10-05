import { NextResponse } from "next/server";
import { countWorkingDays, resolveWorkingWeek, weekdaysFromPatterns } from "@/lib/working-week";
import { bradfordForSickness } from "@/lib/sickness-spells";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SSP_MAX_WEEKS,
  UK_LEL_WEEKLY,
  calculateSspPayableDays,
  calculateSspDailyRate,
  sspPay,
  calculateSspWeeklyRate,
} from "@/lib/uk-compliance";
import {
  getCurrentSMPPhase,
  isMaternityLeaveType,
} from "@/lib/smpCalculator";
import {
  getUKWorkforceCounts,
  hasUKEmployees,
  ukComplianceUnavailablePayload,
} from "@/lib/uk-workforce";
import { isHoursAveragedEmploymentType } from "@/lib/employment-types";
import { recordReadAudit, requestAuditContext } from "@/lib/audit";
import { keepingInTouchRule } from "@/lib/keeping-in-touch";
import {
  UK_COMPLIANCE_TABLES,
  isUkComplianceTableId,
  type BradfordRow,
  type HolidayUsageRow,
  type ParentalRow,
  type SspLiabilityRow,
  type UkComplianceReport,
} from "@/lib/uk-compliance-columns";
import type { AnyPlan } from "@/lib/plans";
import {
  parseExportFormat,
  toCsv,
  toExcel,
  EXPORT_CONTENT_TYPE,
  exportFilename,
} from "@/lib/export-formats";

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
  const ukEmployees = await hasUKEmployees(orgId);
  if (!ukEmployees) {
    return NextResponse.json(ukComplianceUnavailablePayload(), { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department");
  const employmentType = searchParams.get("contractType");
  const threshold = Number(searchParams.get("bradfordThreshold") ?? 200);

  const userWhere: Record<string, unknown> = {
    organizationId: orgId,
    workCountry: "GB",
    isActive: true,
  };
  if (department) userWhere.department = department;
  if (employmentType) userWhere.employmentType = employmentType;

  const users = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      name: true,
      department: true,
      employmentType: true,
      daysWorkedPerWeek: true,
      averageWeeklyEarnings: true,
      workPatterns: { select: { weekday: true, effectiveFrom: true, effectiveTo: true } },
      leaveRequests: {
        where: {
          status: "APPROVED",
          endDate: { gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) },
        },
        include: { leaveType: { select: { name: true } } },
      },
    },
  });

  const holidayUsage = await Promise.all(
    users.map(async (user): Promise<HolidayUsageRow> => {
      const balances = await prisma.leaveRequest.findMany({
        where: {
          userId: user.id,
          status: "APPROVED",
          leaveType: { name: "Annual Leave" },
          startDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
          endDate: { lte: new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999) },
        },
        select: { startDate: true, endDate: true, hoursBooked: true },
      });
      // Irregular/zero-hours workers take holiday in hours (every user here is
      // already workCountry=GB), so report their usage in hours.
      const isHours = isHoursAveragedEmploymentType(user.employmentType);
      const weekdays = weekdaysFromPatterns(user.workPatterns, new Date());
      const taken = isHours
        ? Number(
            balances.reduce((sum, r) => sum + (r.hoursBooked ?? 0), 0).toFixed(1)
          )
        : balances.reduce((sum, r) => sum + countWorkingDays(r.startDate, r.endDate, weekdays), 0);
      return {
        userId: user.id,
        name: user.name,
        department: user.department,
        contractType: user.employmentType,
        taken,
        unit: isHours ? "hours" : "days",
      };
    })
  );

  const bradfordReport = users.map((user): BradfordRow => {
    const sickness = user.leaveRequests.filter((r) => r.leaveType.name.includes("Sick") || r.leaveType.name.includes("SSP"));
    const { spells, days, score } = bradfordForSickness(sickness);
    return {
      userId: user.id,
      name: user.name,
      spells,
      days,
      score,
      flagged: score >= threshold,
    };
  });

  const sspCurrent = users.flatMap((user) => {
    // Post-reform SSP rate is capped at 80% of AWE; fall back to the flat rate
    // when earnings are unknown. Only used for absences booked before the
    // daily rate was stored on them.
    const weeklyRate = calculateSspWeeklyRate(
      user.averageWeeklyEarnings === null
        ? null
        : Number(user.averageWeeklyEarnings)
    );
    return user.leaveRequests
      .filter((r) => r.leaveType.name.includes("SSP") && r.endDate >= new Date())
      .map((r): SspLiabilityRow => {
        // SSP is payable on the days they normally work, as they were when
        // this absence started — the same week the SSP was worked out on.
        const workingWeek = resolveWorkingWeek(
          weekdaysFromPatterns(user.workPatterns, r.startDate),
          user.daysWorkedPerWeek
        );
        const qDays = workingWeek.daysPerWeek;
        const dailyRate =
          r.sspDailyRate !== null
            ? Number(r.sspDailyRate)
            : calculateSspDailyRate(qDays, weeklyRate);
        const maxDays = SSP_MAX_WEEKS * qDays;
        const now = new Date();
        const toDate = r.endDate < now ? r.endDate : now;
        const started = r.startDate <= now;
        const daysElapsed = started ? countWorkingDays(r.startDate, toDate, workingWeek.weekdays) : 0;
        const payableToDate = started
          ? calculateSspPayableDays(r.startDate, toDate, workingWeek.weekdays)
          : 0;
        // The stored SSP days already reflect linked spells and the 28-week
        // cap, so the whole-absence figure uses them.
        const sspDays = r.sspDaysPaid ?? 0;
        return {
          userId: user.id,
          name: user.name,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          qualifyingDaysPerWeek: qDays,
          dailyRate,
          daysElapsed,
          payableDaysToDate: payableToDate,
          estimatedCostToDate: sspPay(Math.min(payableToDate, sspDays), dailyRate, qDays),
          estimatedTotalCost: sspPay(sspDays, dailyRate, qDays),
          sspDaysPaid: sspDays,
          sspLimitReached: r.sspLimitReached ?? false,
          maxDays,
          remainingDays: Math.max(0, maxDays - sspDays),
          belowLel:
            user.averageWeeklyEarnings === null ||
            user.averageWeeklyEarnings === undefined
              ? null
              : Number(user.averageWeeklyEarnings) < UK_LEL_WEEKLY,
        };
      });
  });

  const today = new Date();
  const parental = users.flatMap((user) =>
    user.leaveRequests
      .filter(
        (r) =>
          [
            "Statutory Maternity Leave",
            "Statutory Paternity Leave",
            "Shared Parental Leave (SPL)",
            "Adoption Leave",
          ].includes(r.leaveType.name) && r.endDate >= today
      )
      .map((r): ParentalRow => {
        const kit = keepingInTouchRule(r.leaveType.name);
        const used = kit ? r[kit.field] : 0;
        const isMaternity = isMaternityLeaveType(r.leaveType.name);
        const smp = isMaternity
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
              referenceDate: today,
            })
          : null;
        return {
          requestId: r.id,
          userId: user.id,
          name: user.name,
          leaveType: r.leaveType.name,
          startDate: r.startDate.toISOString(),
          expectedReturnDate: r.endDate.toISOString(),
          keepingInTouch: kit
            ? { kind: kit.kind, used, allowed: kit.allowed, remaining: Math.max(0, kit.allowed - used) }
            : null,
          smp: smp
            ? {
                phase: smp.phase,
                label: smp.label,
                weeklyRate: smp.weeklyRate,
                phase1EndDate: smp.phase1EndDate.toISOString(),
                phase2EndDate: smp.phase2EndDate.toISOString(),
                averageWeeklyEarnings:
                  r.smpAverageWeeklyEarnings === null
                    ? null
                    : Number(r.smpAverageWeeklyEarnings),
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

  const rightToWorkData = await prisma.user.findMany({
    where: { organizationId: orgId, workCountry: "GB", isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      employmentType: true,
      rightToWorkVerified: true,
    },
    orderBy: { name: "asc" },
  });

  const workforce = await getUKWorkforceCounts(orgId);

  // Pro-only read-side audit for compliance reporting access.
  void recordReadAudit({
    plan: sessionUser.plan as AnyPlan | undefined,
    organizationId: orgId,
    action: "compliance_report.viewed",
    resource: "compliance_report",
    actor: {
      id: sessionUser.id as string,
      email: (session.user.email as string | null) ?? null,
      role: userRole,
    },
    metadata: {
      report: "uk-compliance",
      filters: {
        department: department ?? null,
        contractType: employmentType ?? null,
        bradfordThreshold: threshold,
      },
      employeesAnalysed: users.length,
    },
    context: requestAuditContext(request),
  });

  const report: UkComplianceReport = {
    workforce,
    holidayUsage,
    absenceTrigger: { threshold, rows: bradfordReport },
    sspLiability: sspCurrent,
    parentalTracker: parental,
    rightToWork: rightToWorkData,
  };

  const format = parseExportFormat(searchParams.get("format"));
  if (format === "json") {
    return NextResponse.json(report);
  }

  // Tables and their columns live in uk-compliance-columns so the API, the
  // Reports page and the compliance pack can't drift apart.
  if (format === "csv") {
    // One table per CSV (?table=ssp etc.); Bradford when none is named.
    const tableParam = searchParams.get("table");
    const id = isUkComplianceTableId(tableParam) ? tableParam : "bradford";
    const t = UK_COMPLIANCE_TABLES[id];
    const sheet = t.sheet(report);
    const body = toCsv(sheet.rows, sheet.columns);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPE.csv,
        "Content-Disposition": `attachment; filename="${exportFilename(t.file, "csv", new Date())}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Excel: the compliance pack, one sheet per table.
  const buffer = await toExcel(
    Object.values(UK_COMPLIANCE_TABLES).map((t) => t.sheet(report))
  );
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": EXPORT_CONTENT_TYPE.excel,
      "Content-Disposition": `attachment; filename="${exportFilename("coverboard-uk-compliance-pack", "excel", new Date())}"`,
      "Cache-Control": "no-store",
    },
  });
}

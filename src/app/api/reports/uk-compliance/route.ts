import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SSP_MAX_WEEKS,
  UK_LEL_WEEKLY,
  calculateBradfordFactor,
  calculateEstimatedSspCost,
  calculateSspPayableDays,
  calculateSspDailyRate,
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
import { countWeekdays } from "@/lib/utils";
import { isHoursAveragedEmploymentType } from "@/lib/employment-types";
import { recordReadAudit, requestAuditContext } from "@/lib/audit";
import type { AnyPlan } from "@/lib/plans";
import {
  parseExportFormat,
  toCsv,
  toExcel,
  EXPORT_CONTENT_TYPE,
  exportFilename,
  type ExportColumn,
} from "@/lib/export-formats";

function absenceSpells(requests: { startDate: Date; endDate: Date }[]): number {
  if (requests.length === 0) return 0;
  const sorted = [...requests].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  let spells = 1;
  let activeEnd = sorted[0].endDate;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startDate > activeEnd) {
      spells += 1;
      activeEnd = sorted[i].endDate;
    } else if (sorted[i].endDate > activeEnd) {
      activeEnd = sorted[i].endDate;
    }
  }
  return spells;
}

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
      qualifyingDaysPerWeek: true,
      averageWeeklyEarnings: true,
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
    users.map(async (user) => {
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
      const taken = isHours
        ? Number(
            balances.reduce((sum, r) => sum + (r.hoursBooked ?? 0), 0).toFixed(1)
          )
        : balances.reduce((sum, r) => sum + countWeekdays(r.startDate, r.endDate), 0);
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

  const bradfordReport = users.map((user) => {
    const sickness = user.leaveRequests.filter((r) => r.leaveType.name.includes("Sick") || r.leaveType.name.includes("SSP"));
    const spells = absenceSpells(sickness);
    const days = sickness.reduce((sum, r) => sum + countWeekdays(r.startDate, r.endDate), 0);
    const score = calculateBradfordFactor(spells, days);
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
    const qDays = user.qualifyingDaysPerWeek ?? 5;
    const dailyRate = calculateSspDailyRate(qDays);
    const maxDays = SSP_MAX_WEEKS * qDays;
    return user.leaveRequests
      .filter((r) => r.leaveType.name.includes("SSP") && r.endDate >= new Date())
      .map((r) => {
        const daysElapsed = countWeekdays(r.startDate, new Date());
        const payableToDate = calculateSspPayableDays(r.startDate, new Date());
        return {
          userId: user.id,
          name: user.name,
          startDate: r.startDate,
          endDate: r.endDate,
          qualifyingDaysPerWeek: qDays,
          dailyRate,
          daysElapsed,
          payableDaysToDate: payableToDate,
          estimatedCostToDate: calculateEstimatedSspCost(
            r.startDate,
            new Date(),
            undefined,
            qDays
          ),
          sspDaysPaid: r.sspDaysPaid ?? 0,
          sspLimitReached: r.sspLimitReached ?? false,
          maxDays,
          remainingDays: Math.max(0, maxDays - (r.sspDaysPaid ?? 0)),
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
      .map((r) => {
        const cap = r.leaveType.name === "Shared Parental Leave (SPL)" ? 20 : 10;
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
          startDate: r.startDate,
          expectedReturnDate: r.endDate,
          kitDaysUsed: r.kitDaysUsed,
          kitDaysCap: cap,
          kitDaysRemaining: Math.max(0, cap - r.kitDaysUsed),
          smp: smp
            ? {
                phase: smp.phase,
                label: smp.label,
                weeklyRate: smp.weeklyRate,
                phase1EndDate: smp.phase1EndDate,
                phase2EndDate: smp.phase2EndDate,
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

  const format = parseExportFormat(searchParams.get("format"));
  if (format === "json") {
    return NextResponse.json({
      workforce,
      holidayUsage,
      absenceTrigger: {
        threshold,
        rows: bradfordReport,
      },
      sspLiability: sspCurrent,
      parentalTracker: parental,
      rightToWork: rightToWorkData,
    });
  }

  // Tabular exports: the compliance report has 5 distinct tables. CSV
  // serialises the Bradford table only (the most-requested by HR for
  // tribunal evidence); Excel writes every table to its own sheet.
  const bradfordColumns: ExportColumn<(typeof bradfordReport)[number]>[] = [
    { key: "userId", header: "Employee ID" },
    { key: "name", header: "Name" },
    { key: "spells", header: "Absence spells" },
    { key: "days", header: "Absence days" },
    { key: "score", header: "Bradford score" },
    { key: "flagged", header: "Flagged" },
  ];

  const filename = exportFilename(
    "coverboard-uk-compliance",
    format,
    new Date()
  );

  if (format === "csv") {
    const body = toCsv(bradfordReport, bradfordColumns);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPE.csv,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Excel — multi-sheet
  const buffer = await toExcel([
    {
      name: "Bradford Factor",
      columns: bradfordColumns,
      rows: bradfordReport,
    },
    {
      name: "Holiday usage",
      columns: [
        { key: "userId", header: "Employee ID" },
        { key: "name", header: "Name" },
        { key: "department", header: "Department" },
        { key: "contractType", header: "Contract type" },
        { key: "taken", header: "Days taken (YTD)" },
      ],
      rows: holidayUsage,
    },
    {
      name: "SSP liability",
      columns: [
        { key: "userId", header: "Employee ID" },
        { key: "name", header: "Name" },
        {
          key: (r) => {
            const sd = (r as { startDate: Date }).startDate;
            return sd instanceof Date ? sd.toISOString() : sd;
          },
          header: "Spell start",
        },
        {
          key: (r) => {
            const ed = (r as { endDate: Date }).endDate;
            return ed instanceof Date ? ed.toISOString() : ed;
          },
          header: "Spell end",
        },
        { key: "qualifyingDaysPerWeek", header: "Qualifying days/wk" },
        { key: "dailyRate", header: "Daily SSP rate (£)" },
        { key: "sspDaysPaid", header: "Days paid" },
        { key: "remainingDays", header: "Days remaining" },
        { key: "sspLimitReached", header: "Limit reached" },
        { key: "estimatedCostToDate", header: "Estimated cost to date (£)" },
      ],
      rows: sspCurrent,
    },
    {
      name: "Parental leave",
      columns: [
        { key: "userId", header: "Employee ID" },
        { key: "name", header: "Name" },
        { key: "leaveType", header: "Leave type" },
        {
          key: (r) => {
            const sd = (r as { startDate: Date }).startDate;
            return sd instanceof Date ? sd.toISOString() : sd;
          },
          header: "Start date",
        },
        {
          key: (r) => {
            const ed = (r as { expectedReturnDate: Date }).expectedReturnDate;
            return ed instanceof Date ? ed.toISOString() : ed;
          },
          header: "Expected return",
        },
        { key: "kitDaysUsed", header: "KIT days used" },
        { key: "kitDaysCap", header: "KIT cap" },
        { key: "kitDaysRemaining", header: "KIT remaining" },
      ],
      rows: parental,
    },
    {
      name: "Right to work",
      columns: [
        { key: "id", header: "Employee ID" },
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "department", header: "Department" },
        { key: "employmentType", header: "Employment type" },
        { key: "rightToWorkVerified", header: "Verified" },
      ],
      rows: rightToWorkData,
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

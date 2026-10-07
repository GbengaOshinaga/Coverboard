import { firstDateAfterYear, leaveYearBounds } from "@/lib/leave-year";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserLeaveBalances, leaveTakenBy } from "@/lib/leave-balances";
import {
  isFamilyLeaveTypeName,
  planYearEndCarryOver,
  type YearEndRow,
} from "@/lib/carry-over";
import { isSicknessLeaveTypeName } from "@/lib/leave-requests/rules";
import { countWorkingDays, resolveWorkingWeek, weekdaysFromPatterns } from "@/lib/working-week";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { z } from "zod";

const bodySchema = z.object({
  fromYear: z.number().int().min(2020).max(2100),
  dryRun: z.boolean().optional(),
  /**
   * People whose sickness or family leave didn't stop them taking their
   * holiday (the admin's judgement): no statutory carry-over for them.
   */
  excludeStatutory: z.array(z.string()).optional(),
  /**
   * People the employer didn't give a reasonable chance to take their leave
   * (or warn it would be lost): the untaken 4 weeks carry (WTR reg. 13(16)–(18)).
   */
  employerPrevented: z.array(z.string()).optional(),
});

/**
 * Year-end carry-over for every UK employee's Annual Leave, into `fromYear + 1`
 * (rules in src/lib/carry-over.ts):
 *  - sickness carry-over still in date comes forward;
 *  - after sickness or family leave, the untaken part of the 4 weeks (all
 *    untaken leave for irregular-hours staff) — required by law, so it runs
 *    whether or not the team's own carry-over is switched on;
 *  - the team's carry-over from what's left, up to its cap.
 * Idempotent: re-running replaces that person's carry-over for the new year.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can run year-end rollover" },
      { status: 403 }
    );
  }

  const orgId = sessionUser.organizationId as string;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { fromYear, dryRun } = parsed;
  const excluded = new Set(parsed.excludeStatutory ?? []);
  const prevented = new Set(parsed.employerPrevented ?? []);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      ukCarryOverEnabled: true,
      ukCarryOverMax: true,
      ukCarryOverExpiryMonth: true,
      ukCarryOverExpiryDay: true,
      leaveYearStartMonth: true,
      leaveYearStartDay: true,
    },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // UK statutory rules follow the work country, as everywhere else.
  const ukUsers = await prisma.user.findMany({
    where: { organizationId: orgId, workCountry: "GB" },
    select: {
      id: true,
      name: true,
      email: true,
      daysWorkedPerWeek: true,
      workPatterns: { select: { weekday: true, effectiveFrom: true, effectiveTo: true } },
    },
  });

  // `fromYear` is the leave year ending (the year it starts in): 31 Dec, or
  // e.g. 31 Mar the next year for an April leave year.
  const leaveYear = { month: org.leaveYearStartMonth, day: org.leaveYearStartDay };
  const { start: yearStart, end: yearEnd } = leaveYearBounds(fromYear, leaveYear);
  // The team's expiry date ("31 March") next falls after that year ends.
  const companyExpiresAt = firstDateAfterYear(
    fromYear,
    leaveYear,
    org.ukCarryOverExpiryMonth,
    org.ukCarryOverExpiryDay
  );

  const summary: Array<{
    userId: string;
    name: string;
    email: string;
    leaveTypeId: string;
    leaveTypeName: string;
    /** "hours" for irregular/zero-hours staff, whose holiday is in hours. */
    unit: "days" | "hours";
    /** This year's own leave not taken. */
    unusedDays: number;
    sicknessDays: number;
    familyLeaveDays: number;
    statutoryExcluded: boolean;
    employerPrevented: boolean;
    rows: YearEndRow[];
    /** Total carried into next year. */
    daysCarried: number;
  }> = [];

  for (const user of ukUsers) {
    let balances;
    try {
      balances = await getUserLeaveBalances(user.id, fromYear);
    } catch {
      continue;
    }

    const annualLeave = balances.find((b) => b.leaveTypeName === "Annual Leave");
    if (!annualLeave) continue;

    const unit = annualLeave.unit === "hours" ? "hours" : "days";
    const workingWeek = resolveWorkingWeek(
      weekdaysFromPatterns(user.workPatterns, yearEnd),
      user.daysWorkedPerWeek
    );
    const avgHoursPerDay = annualLeave.avgHoursPerDay ?? 7.5;

    const [annualRequests, absences, carriedIn] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          userId: user.id,
          leaveTypeId: annualLeave.leaveTypeId,
          status: "APPROVED",
          startDate: { lte: yearEnd },
          endDate: { gte: yearStart },
        },
        select: { startDate: true, endDate: true, hoursBooked: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          userId: user.id,
          status: "APPROVED",
          startDate: { lte: yearEnd },
          endDate: { gte: yearStart },
        },
        select: { startDate: true, endDate: true, leaveType: { select: { name: true } } },
      }),
      prisma.leaveCarryOverBalance.findMany({
        where: { userId: user.id, leaveTypeId: annualLeave.leaveTypeId, leaveYear: fromYear },
        select: { reason: true, daysCarried: true, expiresAt: true },
      }),
    ]);

    const daysOff = (match: (name: string) => boolean) =>
      absences
        .filter((a) => match(a.leaveType.name))
        .reduce(
          (sum, a) =>
            sum +
            countWorkingDays(
              a.startDate < yearStart ? yearStart : a.startDate,
              a.endDate > yearEnd ? yearEnd : a.endDate,
              workingWeek.weekdays
            ),
          0
        );
    const sicknessDays = daysOff(isSicknessLeaveTypeName);
    const familyLeaveDays = daysOff(isFamilyLeaveTypeName);

    const takenBy = leaveTakenBy(annualRequests, {
      yearStart,
      yearEnd,
      weekdays: workingWeek.weekdays,
      unit,
      avgHoursPerDay,
    });
    const entitlement = annualLeave.allowance - annualLeave.carryOver.inAllowance;
    const { unused, rows } = planYearEndCarryOver({
      fromYear,
      yearEnd,
      unit,
      entitlement,
      carriedIn: carriedIn.map((c) => ({ reason: c.reason, carried: c.daysCarried, expiresAt: c.expiresAt })),
      takenBy,
      daysPerWeek: workingWeek.daysPerWeek,
      avgHoursPerDay,
      sicknessDays,
      familyLeaveDays,
      includeStatutory: !excluded.has(user.id),
      employerPrevented: prevented.has(user.id),
      company: {
        enabled: org.ukCarryOverEnabled,
        // The cap is set in days; irregular-hours staff carry hours.
        max: unit === "hours" ? org.ukCarryOverMax * avgHoursPerDay : org.ukCarryOverMax,
        expiresAt: companyExpiresAt,
      },
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const daysCarried = round2(rows.reduce((sum, r) => sum + r.carried, 0));
    // Listed if anything carries, they were off, or they have leave left
    // (so the admin can record that the employer didn't give the chance).
    if (daysCarried <= 0 && sicknessDays + familyLeaveDays === 0 && unused <= 0) continue;

    summary.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      leaveTypeId: annualLeave.leaveTypeId,
      leaveTypeName: annualLeave.leaveTypeName,
      unit,
      unusedDays: unused,
      sicknessDays,
      familyLeaveDays,
      statutoryExcluded: excluded.has(user.id),
      employerPrevented: prevented.has(user.id),
      rows,
      daysCarried,
    });

    if (!dryRun) {
      // Replace this person's carry-over for the new year (re-runnable).
      await prisma.$transaction([
        prisma.leaveCarryOverBalance.deleteMany({
          where: { userId: user.id, leaveTypeId: annualLeave.leaveTypeId, leaveYear: fromYear + 1 },
        }),
        prisma.leaveCarryOverBalance.createMany({
          data: rows.map((r) => ({
            userId: user.id,
            leaveTypeId: annualLeave.leaveTypeId,
            leaveYear: fromYear + 1,
            reason: r.reason,
            daysCarried: r.carried,
            daysRemaining: r.carried,
            expiresAt: r.expiresAt,
          })),
        }),
      ]);
    }
  }

  if (!dryRun) {
    recordAudit({
      organizationId: orgId,
      action: "carry_over.rollover_run",
      resource: "carry_over",
      resourceId: null,
      actor: {
        id: sessionUser.id as string,
        email: session.user.email ?? null,
        role: userRole,
      },
      metadata: {
        fromYear,
        toYear: fromYear + 1,
        processed: summary.length,
        companyExpiresAt: companyExpiresAt.toISOString(),
        statutoryExcluded: [...excluded],
        employerPrevented: [...prevented],
      },
      context: requestAuditContext(request),
    });
  }

  return NextResponse.json({
    fromYear,
    toYear: fromYear + 1,
    companyExpiresAt: companyExpiresAt.toISOString(),
    dryRun: !!dryRun,
    processed: summary.length,
    summary,
  });
}

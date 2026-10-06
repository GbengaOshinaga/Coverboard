import { prisma } from "@/lib/prisma";
import { countWorkingDays, prorateForStartDate, resolveWorkingWeek, weekdaysFromPatterns, weeksToWorkingDays } from "@/lib/working-week";
import { countWeekdays } from "@/lib/utils";
import { carryOverInEffect, type CarryOverReason } from "@/lib/carry-over";
import { leaveYearBounds } from "@/lib/leave-year";
import {
  calculateUkProRatedAnnualLeave,
  calculateIrregularHoursAccrual,
} from "@/lib/uk-compliance";
import { isHoursAveragedEmploymentType } from "@/lib/employment-types";

export type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  allowance: number;
  /** For week-based statutory leave: the allowance in weeks (allowance is days). */
  allowanceWeeks?: number;
  proRatedEntitlement?: number;
  /**
   * Statutory holiday accrued to date in HOURS, for irregular/zero-hours
   * workers whose entitlement is computed at 12.07% of logged hours. Only set
   * when `unit === "hours"`, in which case `allowance`/`used`/`pending`/
   * `remaining` are also all measured in hours.
   */
  entitlementHours?: number;
  /** Unit the entitlement is genuinely measured in. Defaults to "days". */
  unit: "days" | "hours";
  /**
   * Average hours per working day for an hours-unit worker — used to default a
   * booking's hours (working days × this) and to show a rough days-equivalent.
   */
  avgHoursPerDay?: number;
  used: number;
  pending: number;
  remaining: number;
  carryOver: {
    /** Carried into this year, all kinds. */
    carried: number;
    /** What carry-over adds to the allowance now (used + still available). */
    inAllowance: number;
    /** Still available. */
    remaining: number;
    /** Soonest expiry of carry-over still available. */
    expiresAt: string | null;
    /** Some carry-over expired unused. */
    expired: boolean;
    /** Each kind, soonest expiry first (src/lib/carry-over.ts). */
    parts: Array<{
      reason: CarryOverReason;
      carried: number;
      used: number;
      lapsed: number;
      remaining: number;
      expiresAt: string | null;
    }>;
  };
};

/**
 * Leave of one type taken (or booked) in a year up to a date, in the
 * balance's unit: only days they'd have worked, or the hours booked for
 * irregular-hours staff (split across days when a booking straddles the date).
 * Shared by balances and the year-end carry-over so they count leave alike.
 */
export function leaveTakenBy(
  requests: ReadonlyArray<{ startDate: Date; endDate: Date; hoursBooked: number | null }>,
  opts: {
    yearStart: Date;
    yearEnd: Date;
    weekdays: number[] | null;
    unit: "days" | "hours";
    avgHoursPerDay: number;
  }
): (date: Date | null) => number {
  return (date) => {
    let total = 0;
    for (const req of requests) {
      const start = req.startDate < opts.yearStart ? opts.yearStart : req.startDate;
      const end = req.endDate > opts.yearEnd ? opts.yearEnd : req.endDate;
      const until = date !== null && date < end ? date : end;
      if (until < start) continue;
      const days = countWorkingDays(start, end, opts.weekdays);
      const daysBy = countWorkingDays(start, until, opts.weekdays);
      if (opts.unit === "hours") {
        const hours = req.hoursBooked ?? days * opts.avgHoursPerDay;
        total += days > 0 ? (hours * daysBy) / days : 0;
      } else {
        total += daysBy;
      }
    }
    return total;
  };
}

/**
 * Adjust an Annual Leave allowance for the org's bank-holiday accounting mode.
 *
 * The base UK allowance (28 days) is the WTR 5.6-week statutory minimum, which
 * is *inclusive* of bank holidays. When an org runs in "exclusive" mode
 * (`ukBankHolidayInclusive = false`) the bank holidays are tracked separately,
 * so the discretionary Annual Leave bucket is the statutory total minus the
 * bank holidays (e.g. 28 - 8 = 20). Either way the total time off stays at the
 * statutory 28. Only UK Annual Leave is affected; everything else passes
 * through unchanged.
 *
 * UK-ness is keyed off `workCountry` (where the employee works), matching every
 * other UK-compliance gate in the app (`hasUKEmployees`, holiday pay, reports,
 * and the settings toggle's visibility). `countryCode` is the legacy field and
 * must NOT be used here: gating on it would apply the bank-holiday split to
 * employees whose work location is unset, while the settings page — which keys
 * the toggle off `workCountry` — hides the control, leaving the accounting with
 * no visible governing switch.
 */
export function adjustAllowanceForBankHolidays(params: {
  allowance: number;
  workCountry: string | null;
  leaveTypeName: string;
  ukBankHolidayInclusive: boolean;
  ukRegionalBankHolidayCount: number;
}): number {
  const {
    allowance,
    workCountry,
    leaveTypeName,
    ukBankHolidayInclusive,
    ukRegionalBankHolidayCount,
  } = params;
  if (
    workCountry === "GB" &&
    leaveTypeName === "Annual Leave" &&
    !ukBankHolidayInclusive
  ) {
    return Math.max(0, allowance - ukRegionalBankHolidayCount);
  }
  return allowance;
}

/**
 * Calculate leave balances for a user for a given leave year (identified by
 * the calendar year it starts in; see src/lib/leave-year.ts).
 *
 * For each leave type in the org:
 * 1. Look up the country-specific policy allowance (LeavePolicy for user's countryCode)
 * 2. Fall back to the leave type's defaultDays if no policy exists
 * 3. Sum weekdays from all APPROVED requests in that year = "used"
 * 4. Sum weekdays from all PENDING requests in that year = "pending"
 * 5. remaining = allowance - used - pending
 */
export async function getUserLeaveBalances(
  userId: string,
  year: number
): Promise<LeaveBalance[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      countryCode: true,
      workCountry: true,
      organizationId: true,
      employmentType: true,
      daysWorkedPerWeek: true,
      serviceStartDate: true,
      workPatterns: { select: { weekday: true, effectiveFrom: true, effectiveTo: true } },
      weeklyHours: {
        orderBy: { weekStartDate: "asc" },
        select: { hoursWorked: true, weekStartDate: true },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const orgUk = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      ukBankHolidayInclusive: true,
      ukBankHolidayRegion: true,
      fullTimeHoursPerWeek: true,
      leaveYearStartMonth: true,
      leaveYearStartDay: true,
    },
  });
  const ukBankHolidayInclusive = orgUk?.ukBankHolidayInclusive ?? true;
  const ukBankHolidayRegion = orgUk?.ukBankHolidayRegion ?? "ENGLAND_WALES";
  const fullTimeHoursPerWeek = Number(orgUk?.fullTimeHoursPerWeek ?? 37.5);

  // `year` is the leave year (the year it starts in): 1 Jan–31 Dec, or e.g.
  // 1 Apr 2026–31 Mar 2027 for a team whose leave year starts in April.
  const { start: yearStart, end: yearEnd } = leaveYearBounds(year, {
    month: orgUk?.leaveYearStartMonth ?? 1,
    day: orgUk?.leaveYearStartDay ?? 1,
  });

  // Which days they work: their working pattern's days, else their stored
  // days-per-week (Mon–Fri assumed). Drives part-time entitlement, how many
  // days a booking uses, and how big a statutory "week" of leave is.
  const workingWeek = resolveWorkingWeek(
    weekdaysFromPatterns(user.workPatterns, new Date()),
    user.daysWorkedPerWeek
  );
  // A starter only gets the bank holidays left after they join.
  const bankHolidaysFrom =
    user.serviceStartDate && user.serviceStartDate > yearStart ? user.serviceStartDate : yearStart;

  // Irregular-hours / zero-hours workers accrue statutory holiday at 12.07% of
  // the hours they actually work (post-2024 method), measured in HOURS. We sum
  // the hours they have logged this leave year as the accrual base. The
  // days-equivalent (for the day-based balance UI, since booking is still
  // days in Phase 1) divides by their average working day; zero-hours workers
  // can have daysWorkedPerWeek = 0, so fall back to a standard 7.5h day.
  const isHoursWorker = isHoursAveragedEmploymentType(user.employmentType);
  const hoursThisYear = user.weeklyHours
    .filter((h) => h.weekStartDate >= yearStart && h.weekStartDate <= yearEnd)
    .reduce((sum, h) => sum + h.hoursWorked, 0);
  const weeksThisYear = user.weeklyHours.filter(
    (h) => h.weekStartDate >= yearStart && h.weekStartDate <= yearEnd
  ).length;
  const avgWeeklyHours = weeksThisYear > 0 ? hoursThisYear / weeksThisYear : 0;
  const avgHoursPerDay =
    user.daysWorkedPerWeek > 0
      ? avgWeeklyHours / user.daysWorkedPerWeek
      : fullTimeHoursPerWeek / 5;

  // The pro-rata calculations (part-time days/5 × 28 and the 12.07% irregular
  // accrual) are UK statutory, so they only apply to UK-based workers. Keyed
  // off `workCountry`, matching the bank-holiday gate and `hasUKEmployees`; a
  // non-UK worker keeps their country-policy base allowance.
  const isUk = user.workCountry === "GB";

  const carryOverBalances = await prisma.leaveCarryOverBalance.findMany({
    where: {
      userId,
      leaveYear: year,
    },
    select: {
      leaveTypeId: true,
      reason: true,
      daysCarried: true,
      daysRemaining: true,
      expiresAt: true,
    },
  });

  let ukRegionalBankHolidayCount = 0;
  if (user.workCountry === "GB" && !ukBankHolidayInclusive) {
    ukRegionalBankHolidayCount = await prisma.bankHoliday.count({
      where: {
        organizationId: user.organizationId,
        region: ukBankHolidayRegion,
        date: {
          gte: bankHolidaysFrom,
          lte: yearEnd,
        },
      },
    });
  }

  // Fetch leave types for the org, including country-specific policies
  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId: user.organizationId },
    include: {
      leavePolicies: {
        where: { countryCode: user.countryCode },
      },
    },
    orderBy: { name: "asc" },
  });

  // Fetch all of this user's leave requests for the year (approved + pending)
  const requests = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: yearEnd },
      endDate: { gte: yearStart },
    },
    select: {
      leaveTypeId: true,
      startDate: true,
      endDate: true,
      status: true,
      hoursBooked: true,
    },
  });

  // Unpaid parental leave isn't a per-person allowance: it's 4 weeks a year
  // and 18 in total for each child, shown per child (src/lib/unpaid-parental.ts).
  return leaveTypes.filter((lt) => !/unpaid parental/i.test(lt.name)).map((lt) => {
    const policy = lt.leavePolicies[0];
    const baseAllowance = policy?.annualAllowance ?? lt.defaultDays;
    // Statutory family leave is set in weeks of their normal working week:
    // 2 weeks' paternity is 10 days for a 5-day worker, 6 for a 3-day worker.
    const allowanceWeeks = lt.allowanceUnit === "WEEKS" ? baseAllowance : undefined;
    let allowance =
      allowanceWeeks !== undefined
        ? weeksToWorkingDays(allowanceWeeks, workingWeek.daysPerWeek)
        : baseAllowance;
    let proRatedEntitlement: number | undefined;
    let entitlementHours: number | undefined;
    let unit: "days" | "hours" = "days";

    if (lt.applyProRata && isUk && isHoursWorker) {
      // Hours-based statutory accrual (12.07% of logged hours). Entitlement and
      // deduction are both in HOURS for these workers, so `allowance` carries
      // the hours figure and used/pending are summed in hours below. The
      // bank-holiday inclusive/exclusive split is deliberately NOT applied here
      // — 12.07% accrual already encompasses bank holidays, so subtracting them
      // again would double-count.
      unit = "hours";
      entitlementHours = calculateIrregularHoursAccrual(hoursThisYear);
      allowance = entitlementHours;
    } else {
      if (lt.applyProRata && isUk) {
        const calculatedEntitlement = calculateUkProRatedAnnualLeave({
          employmentType: user.employmentType,
          daysWorkedPerWeek: workingWeek.daysPerWeek,
          weeklyHours: user.weeklyHours.map((h) => h.hoursWorked),
          fullTimeHoursPerWeek,
        });
        if (calculatedEntitlement !== null) {
          proRatedEntitlement = calculatedEntitlement;
          allowance = proRatedEntitlement;
        }
        // Started part-way through the year: only the share of the year
        // they're employed for, rounded up.
        const starterAllowance = prorateForStartDate(allowance, user.serviceStartDate, yearStart, yearEnd);
        if (starterAllowance !== allowance) {
          proRatedEntitlement = starterAllowance;
          allowance = starterAllowance;
        }
      }
      allowance = adjustAllowanceForBankHolidays({
        allowance,
        workCountry: user.workCountry,
        leaveTypeName: lt.name,
        ukBankHolidayInclusive,
        ukRegionalBankHolidayCount,
      });
    }

    // Carry-over is used before this year's leave, soonest-expiring first;
    // when it expires only the unused part lapses. Stored in the balance's own
    // unit (hours for irregular-hours staff), so it adds straight on.
    const carry = carryOverInEffect(
      carryOverBalances
        .filter((c) => c.leaveTypeId === lt.id)
        .map((c) => ({ reason: c.reason, carried: c.daysCarried, expiresAt: c.expiresAt })),
      leaveTakenBy(
        requests.filter((r) => r.leaveTypeId === lt.id),
        { yearStart, yearEnd, weekdays: workingWeek.weekdays, unit, avgHoursPerDay }
      ),
      new Date()
    );
    allowance += carry.allowance;
    const available = carry.parts.filter((p) => p.remaining > 0);

    // Only the days they'd have worked come off their balance; hours-unit
    // balances deduct the hours booked (working days × their average day for
    // older bookings without hours).
    const countOpts = { yearStart, yearEnd, weekdays: workingWeek.weekdays, unit, avgHoursPerDay };
    const ofType = requests.filter((r) => r.leaveTypeId === lt.id);
    const used = leaveTakenBy(ofType.filter((r) => r.status === "APPROVED"), countOpts)(null);
    const pending = leaveTakenBy(ofType.filter((r) => r.status !== "APPROVED"), countOpts)(null);

    return {
      leaveTypeId: lt.id,
      leaveTypeName: lt.name,
      leaveTypeColor: lt.color,
      allowance,
      allowanceWeeks,
      proRatedEntitlement,
      entitlementHours,
      unit,
      avgHoursPerDay: unit === "hours" ? avgHoursPerDay : undefined,
      used,
      pending,
      remaining: Math.max(0, allowance - used - pending),
      carryOver: {
        carried: carry.parts.reduce((s, p) => s + p.carried, 0),
        inAllowance: carry.allowance,
        remaining: available.reduce((s, p) => s + p.remaining, 0),
        expiresAt: available.find((p) => p.expiresAt)?.expiresAt?.toISOString() ?? null,
        expired: carry.parts.some((p) => p.lapsed > 0),
        parts: carry.parts.map((p) => ({
          reason: p.reason,
          carried: p.carried,
          used: p.used,
          lapsed: p.lapsed,
          remaining: p.remaining,
          expiresAt: p.expiresAt?.toISOString() ?? null,
        })),
      },
    };
  });
}

/**
 * Get the balance for a single leave type for a user.
 * Useful for quick checks when submitting a request.
 */
export async function getUserLeaveBalance(
  userId: string,
  leaveTypeId: string,
  year: number
): Promise<LeaveBalance | null> {
  const balances = await getUserLeaveBalances(userId, year);
  return balances.find((b) => b.leaveTypeId === leaveTypeId) ?? null;
}

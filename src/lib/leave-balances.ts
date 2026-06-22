import { prisma } from "@/lib/prisma";
import { countWeekdays } from "@/lib/utils";
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
  proRatedEntitlement?: number;
  /**
   * Statutory holiday accrued to date in HOURS, for irregular/zero-hours
   * workers whose entitlement is computed at 12.07% of logged hours. Only set
   * when `unit === "hours"`; `allowance` still carries the days-equivalent so
   * the day-based balance UI and warn-only booking check stay coherent in
   * Phase 1 (booking remains days-based).
   */
  entitlementHours?: number;
  /** Unit the entitlement is genuinely measured in. Defaults to "days". */
  unit: "days" | "hours";
  used: number;
  pending: number;
  remaining: number;
  carryOver: {
    carried: number;
    remaining: number;
    expiresAt: string | null;
    expired: boolean;
  };
};

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
 * Calculate leave balances for a user for a given year.
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
    },
  });
  const ukBankHolidayInclusive = orgUk?.ukBankHolidayInclusive ?? true;
  const ukBankHolidayRegion = orgUk?.ukBankHolidayRegion ?? "ENGLAND_WALES";
  const fullTimeHoursPerWeek = Number(orgUk?.fullTimeHoursPerWeek ?? 37.5);

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  // Irregular-hours / zero-hours workers accrue statutory holiday at 12.07% of
  // the hours they actually work (post-2024 method), measured in HOURS. We sum
  // the hours they have logged this calendar year as the accrual base. The
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
          gte: yearStart,
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
    },
  });

  return leaveTypes.map((lt) => {
    const policy = lt.leavePolicies[0];
    const baseAllowance = policy?.annualAllowance ?? lt.defaultDays;
    let allowance = baseAllowance;
    let proRatedEntitlement: number | undefined;
    let entitlementHours: number | undefined;
    let unit: "days" | "hours" = "days";

    if (lt.applyProRata && isUk && isHoursWorker) {
      // Hours-based statutory accrual (12.07% of logged hours). Headline figure
      // is HOURS accrued to date; the days-equivalent feeds the existing
      // day-based balance maths until booking goes hours-native (Phase 2). The
      // bank-holiday inclusive/exclusive split is deliberately NOT applied here
      // — 12.07% accrual already encompasses bank holidays, so subtracting them
      // again would double-count.
      unit = "hours";
      entitlementHours = calculateIrregularHoursAccrual(hoursThisYear);
      allowance = avgHoursPerDay > 0 ? Math.round(entitlementHours / avgHoursPerDay) : 0;
    } else {
      if (lt.applyProRata && isUk) {
        const calculatedEntitlement = calculateUkProRatedAnnualLeave({
          employmentType: user.employmentType,
          daysWorkedPerWeek: user.daysWorkedPerWeek,
          weeklyHours: user.weeklyHours.map((h) => h.hoursWorked),
          fullTimeHoursPerWeek,
        });
        if (calculatedEntitlement !== null) {
          proRatedEntitlement = calculatedEntitlement;
          allowance = proRatedEntitlement;
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

    const carryOver = carryOverBalances.find((c) => c.leaveTypeId === lt.id);
    // Carry-over only counts toward the allowance until it expires. Once the
    // expiry date has passed, the leftover days lapse and must not inflate the
    // allowance (or show as available on the balance page).
    const carryOverExpired = carryOver?.expiresAt
      ? carryOver.expiresAt.getTime() < Date.now()
      : false;
    const carryOverRemaining = carryOverExpired
      ? 0
      : carryOver?.daysRemaining ?? 0;
    allowance += carryOverRemaining;

    let used = 0;
    let pending = 0;

    for (const req of requests) {
      if (req.leaveTypeId !== lt.id) continue;

      const start = req.startDate < yearStart ? yearStart : req.startDate;
      const end = req.endDate > yearEnd ? yearEnd : req.endDate;
      const days = countWeekdays(start, end);

      if (req.status === "APPROVED") {
        used += days;
      } else {
        pending += days;
      }
    }

    return {
      leaveTypeId: lt.id,
      leaveTypeName: lt.name,
      leaveTypeColor: lt.color,
      allowance,
      proRatedEntitlement,
      entitlementHours,
      unit,
      used,
      pending,
      remaining: Math.max(0, allowance - used - pending),
      carryOver: {
        carried: carryOver?.daysCarried ?? 0,
        remaining: carryOverRemaining,
        expiresAt: carryOver?.expiresAt?.toISOString() ?? null,
        expired: carryOverExpired,
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

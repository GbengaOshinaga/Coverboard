import { countWeekdays } from "@/lib/utils";

/**
 * Mirrors Prisma enums `EmploymentType` and `BankHolidayRegion` (same string values).
 * Defined here so this file does not depend on generated `@prisma/client` types.
 */
export const EmploymentType = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  VARIABLE_HOURS: "VARIABLE_HOURS",
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const BankHolidayRegion = {
  ENGLAND_WALES: "ENGLAND_WALES",
  SCOTLAND: "SCOTLAND",
  NORTHERN_IRELAND: "NORTHERN_IRELAND",
} as const;
export type BankHolidayRegion =
  (typeof BankHolidayRegion)[keyof typeof BankHolidayRegion];

// Statutory Sick Pay weekly rate for 2024/25 (as of 6 April 2024).
// Update each April via HMRC guidance (https://www.gov.uk/employers-sick-pay).
const DEFAULT_SSP_WEEKLY_RATE = 116.75;
const DEFAULT_SMP_WEEKLY_RATE = 184.03;
// Lower Earnings Limit for Class 1 NICs (2024/25 tax year). Employees below
// this weekly average earnings threshold are not entitled to SSP.
// Update each April via HMRC guidance.
const DEFAULT_LEL_WEEKLY = 123;

export const UK_SSP_WEEKLY_RATE = Number(
  process.env.SSP_WEEKLY_RATE ?? DEFAULT_SSP_WEEKLY_RATE
);
export const UK_SMP_WEEKLY_RATE = Number(
  process.env.SMP_WEEKLY_RATE ?? DEFAULT_SMP_WEEKLY_RATE
);
/**
 * Lower Earnings Limit (LEL) — weekly earnings threshold below which SSP
 * is not payable. Update each April via HMRC guidance.
 */
export const UK_LEL_WEEKLY = Number(
  process.env.LEL_WEEKLY ?? DEFAULT_LEL_WEEKLY
);

/**
 * Maximum cumulative SSP payable per period of incapacity for work (PIW).
 * Statute caps SSP at 28 weeks — at 5 qualifying days per week that is 140
 * days, but the 28-week limit is a calendar limit, not a day limit, so we
 * track both. The day-count field (`sspDaysPaid`) is compared against the
 * employee's own `qualifyingDaysPerWeek × 28` derived limit.
 */
export const SSP_MAX_WEEKS = 28;
/** Legacy constant kept for compatibility with callers that hard-code 140. */
export const SSP_MAX_DAYS_AT_5_DAY_WEEK = SSP_MAX_WEEKS * 5;

export type UKContractInput = {
  employmentType: EmploymentType;
  daysWorkedPerWeek: number;
  weeklyHours: number[];
};

export function calculateVariableHoursFte(weeklyHours: number[]): number {
  if (weeklyHours.length === 0) return 1;
  const recent52 = weeklyHours.slice(-52);
  const average = recent52.reduce((sum, h) => sum + h, 0) / recent52.length;
  const fte = average / 37.5;
  return Number(Math.max(0, Math.min(1, fte)).toFixed(3));
}

export function calculateUkProRatedAnnualLeave(input: UKContractInput): number {
  if (input.employmentType === EmploymentType.PART_TIME) {
    return Number(((input.daysWorkedPerWeek / 5) * 28).toFixed(2));
  }
  if (input.employmentType === EmploymentType.VARIABLE_HOURS) {
    return Number((calculateVariableHoursFte(input.weeklyHours) * 28).toFixed(2));
  }
  return 28;
}

export function calculateBradfordFactor(absenceSpells: number, absenceDays: number): number {
  return absenceSpells * absenceSpells * absenceDays;
}

/**
 * Payable SSP days = consecutive weekdays of sickness less the 3 waiting
 * days. Waiting-day logic is unchanged — do not touch.
 */
export function calculateSspPayableDays(startDate: Date, endDate: Date): number {
  const consecutiveDays = countWeekdays(startDate, endDate);
  if (consecutiveDays <= 3) return 0;
  return consecutiveDays - 3;
}

/**
 * SSP is only payable on qualifying days (typically the employee's usual
 * working days). Dividing the weekly rate by `qualifyingDaysPerWeek`
 * produces the correct daily figure; dividing by 7 under-pays employees
 * who don't work weekends and exposes the employer to HMRC penalties.
 *
 * @param qualifyingDaysPerWeek Working days the employee is contracted for
 *        (1–7). Defaults to 5. Missing/invalid values fall back to 5.
 */
export function calculateSspDailyRate(
  qualifyingDaysPerWeek: number | null | undefined,
  weeklyRate: number = UK_SSP_WEEKLY_RATE
): number {
  const qDays = Number(qualifyingDaysPerWeek);
  const safeQDays =
    Number.isFinite(qDays) && qDays >= 1 && qDays <= 7 ? qDays : 5;
  return Number((weeklyRate / safeQDays).toFixed(2));
}

export type SspEligibilityInput = {
  /** Employee's average weekly earnings over the relevant 8-week period. */
  averageWeeklyEarnings: number | null | undefined;
  /** Cumulative SSP days already paid in this PIW. */
  sspDaysPaidInPeriod: number;
  /** Working days per week used for the daily rate and the day-cap. */
  qualifyingDaysPerWeek: number | null | undefined;
  /** Weekly SSP rate (defaults to the current HMRC rate from env). */
  weeklyRate?: number;
  /** LEL override for tests (defaults to UK_LEL_WEEKLY). */
  lelWeekly?: number;
};

export type SspEligibilityResult =
  | {
      eligible: true;
      dailyRate: number;
      remainingDays: number;
      maxDays: number;
      qualifyingDaysPerWeek: number;
    }
  | {
      eligible: false;
      reason:
        | "Below Lower Earnings Limit"
        | "SSP 28-week limit reached"
        | "Missing average weekly earnings";
      dailyRate?: number;
    };

/**
 * Gate an SSP calculation on the two statutory eligibility checks:
 *
 *   1. Average weekly earnings must be **at least** the Lower Earnings
 *      Limit (≥ £123/wk for 2024/25). Below the LEL → not eligible.
 *   2. Cumulative SSP paid in this PIW must be under the 28-week cap
 *      (28 × qualifyingDaysPerWeek; 140 days at a 5-day week).
 *
 * Callers should resolve `averageWeeklyEarnings` from HR records or the
 * 8-week running total of `WeeklyEarning` rows.
 */
export function calculateSspEntitlement(
  input: SspEligibilityInput
): SspEligibilityResult {
  const lel = input.lelWeekly ?? UK_LEL_WEEKLY;
  const weeklyRate = input.weeklyRate ?? UK_SSP_WEEKLY_RATE;
  const qDaysRaw = Number(input.qualifyingDaysPerWeek);
  const qualifyingDaysPerWeek =
    Number.isFinite(qDaysRaw) && qDaysRaw >= 1 && qDaysRaw <= 7
      ? qDaysRaw
      : 5;
  const maxDays = SSP_MAX_WEEKS * qualifyingDaysPerWeek;

  if (
    input.averageWeeklyEarnings === null ||
    input.averageWeeklyEarnings === undefined
  ) {
    return { eligible: false, reason: "Missing average weekly earnings" };
  }

  const avg = Number(input.averageWeeklyEarnings);
  if (avg < lel) {
    return { eligible: false, reason: "Below Lower Earnings Limit" };
  }

  if (input.sspDaysPaidInPeriod >= maxDays) {
    return { eligible: false, reason: "SSP 28-week limit reached" };
  }

  return {
    eligible: true,
    dailyRate: calculateSspDailyRate(qualifyingDaysPerWeek, weeklyRate),
    remainingDays: maxDays - input.sspDaysPaidInPeriod,
    maxDays,
    qualifyingDaysPerWeek,
  };
}

/**
 * Legacy helper kept so existing call sites compile. The returned figure
 * assumes a 5-day working week — callers that have access to employee
 * metadata should prefer {@link calculateSspEntitlement} followed by
 * `dailyRate × payableDays`.
 */
export function calculateEstimatedSspCost(
  startDate: Date,
  endDate: Date,
  weeklyRate = UK_SSP_WEEKLY_RATE,
  qualifyingDaysPerWeek = 5
): number {
  const payableDays = calculateSspPayableDays(startDate, endDate);
  const daily = calculateSspDailyRate(qualifyingDaysPerWeek, weeklyRate);
  return Number((daily * payableDays).toFixed(2));
}

type BankHolidayEntry = {
  name: string;
  date: string;
};

const UK_BANK_HOLIDAYS: Record<number, Record<BankHolidayRegion, BankHolidayEntry[]>> = {
  2026: {
    ENGLAND_WALES: [
      { name: "New Year's Day", date: "2026-01-01" },
      { name: "Good Friday", date: "2026-04-03" },
      { name: "Easter Monday", date: "2026-04-06" },
      { name: "Early May bank holiday", date: "2026-05-04" },
      { name: "Spring bank holiday", date: "2026-05-25" },
      { name: "Summer bank holiday", date: "2026-08-31" },
      { name: "Christmas Day", date: "2026-12-25" },
      { name: "Boxing Day (substitute)", date: "2026-12-28" },
    ],
    SCOTLAND: [
      { name: "New Year's Day", date: "2026-01-01" },
      { name: "2nd January", date: "2026-01-02" },
      { name: "Good Friday", date: "2026-04-03" },
      { name: "Early May bank holiday", date: "2026-05-04" },
      { name: "Spring bank holiday", date: "2026-05-25" },
      { name: "Summer bank holiday", date: "2026-08-03" },
      { name: "St Andrew's Day", date: "2026-11-30" },
      { name: "Christmas Day", date: "2026-12-25" },
      { name: "Boxing Day (substitute)", date: "2026-12-28" },
    ],
    NORTHERN_IRELAND: [
      { name: "New Year's Day", date: "2026-01-01" },
      { name: "St Patrick's Day", date: "2026-03-17" },
      { name: "Good Friday", date: "2026-04-03" },
      { name: "Easter Monday", date: "2026-04-06" },
      { name: "Early May bank holiday", date: "2026-05-04" },
      { name: "Spring bank holiday", date: "2026-05-25" },
      { name: "Battle of the Boyne (Orangemen's Day) (substitute)", date: "2026-07-13" },
      { name: "Summer bank holiday", date: "2026-08-31" },
      { name: "Christmas Day", date: "2026-12-25" },
      { name: "Boxing Day (substitute)", date: "2026-12-28" },
    ],
  },
  2027: {
    ENGLAND_WALES: [
      { name: "New Year's Day", date: "2027-01-01" },
      { name: "Good Friday", date: "2027-03-26" },
      { name: "Easter Monday", date: "2027-03-29" },
      { name: "Early May bank holiday", date: "2027-05-03" },
      { name: "Spring bank holiday", date: "2027-05-31" },
      { name: "Summer bank holiday", date: "2027-08-30" },
      { name: "Christmas Day (substitute)", date: "2027-12-27" },
      { name: "Boxing Day (substitute)", date: "2027-12-28" },
    ],
    SCOTLAND: [
      { name: "New Year's Day", date: "2027-01-01" },
      { name: "2nd January (substitute)", date: "2027-01-04" },
      { name: "Good Friday", date: "2027-03-26" },
      { name: "Early May bank holiday", date: "2027-05-03" },
      { name: "Spring bank holiday", date: "2027-05-31" },
      { name: "Summer bank holiday", date: "2027-08-02" },
      { name: "St Andrew's Day", date: "2027-11-30" },
      { name: "Christmas Day (substitute)", date: "2027-12-27" },
      { name: "Boxing Day (substitute)", date: "2027-12-28" },
    ],
    NORTHERN_IRELAND: [
      { name: "New Year's Day", date: "2027-01-01" },
      { name: "St Patrick's Day", date: "2027-03-17" },
      { name: "Good Friday", date: "2027-03-26" },
      { name: "Easter Monday", date: "2027-03-29" },
      { name: "Early May bank holiday", date: "2027-05-03" },
      { name: "Spring bank holiday", date: "2027-05-31" },
      { name: "Battle of the Boyne (Orangemen's Day)", date: "2027-07-12" },
      { name: "Summer bank holiday", date: "2027-08-30" },
      { name: "Christmas Day (substitute)", date: "2027-12-27" },
      { name: "Boxing Day (substitute)", date: "2027-12-28" },
    ],
  },
};

export function getUkBankHolidaysForRegion(year: number, region: BankHolidayRegion): { name: string; date: Date; region: BankHolidayRegion }[] {
  const byYear = UK_BANK_HOLIDAYS[year];
  if (!byYear) return [];
  return byYear[region].map((h) => ({
    name: h.name,
    date: new Date(`${h.date}T00:00:00.000Z`),
    region,
  }));
}

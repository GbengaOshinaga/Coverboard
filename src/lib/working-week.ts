/**
 * Which days someone works — the one answer holiday pay, holiday entitlement,
 * SSP and week-based statutory leave all depend on.
 *
 * If the person has a working pattern (shift mode), their working weekdays
 * are the days it schedules. Otherwise we only know how many days a week
 * they work (`daysWorkedPerWeek`), not which ones; Mon–Fri is assumed for
 * counting, and the count drives rates and entitlements.
 *
 * Dates are UTC-midnight Dates, as stored for leave. Weekdays are
 * Monday-first (0 = Monday … 6 = Sunday), matching working patterns.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MON_TO_FRI = [0, 1, 2, 3, 4];

export type WorkingWeek = {
  /** Weekdays they work, or null when only the count is known. */
  weekdays: number[] | null;
  /** Working days per week (1–7), for daily rates and week conversions. */
  daysPerWeek: number;
};

function mondayFirst(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Weekdays a set of working-pattern rows schedules on `onDate` (patterns
 * active that day), sorted. Null when none are active.
 */
export function weekdaysFromPatterns(
  patterns: ReadonlyArray<{ weekday: number; effectiveFrom: Date; effectiveTo: Date | null }>,
  onDate: Date
): number[] | null {
  const t = onDate.getTime();
  const days = new Set<number>();
  for (const p of patterns) {
    if (p.effectiveFrom.getTime() <= t && (p.effectiveTo === null || p.effectiveTo.getTime() >= t)) {
      days.add(p.weekday);
    }
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : null;
}

/** Pattern days win; otherwise the stored count (falling back to 5). */
export function resolveWorkingWeek(
  patternWeekdays: number[] | null,
  storedDaysPerWeek: number | null | undefined
): WorkingWeek {
  if (patternWeekdays && patternWeekdays.length > 0) {
    return { weekdays: patternWeekdays, daysPerWeek: patternWeekdays.length };
  }
  const n = Number(storedDaysPerWeek);
  return { weekdays: null, daysPerWeek: Number.isFinite(n) && n >= 1 && n <= 7 ? n : 5 };
}

/**
 * Working days between two dates inclusive. With known weekdays, counts
 * exactly those days (weekends included if they work them). Without, counts
 * Mon–Fri — the most that can be said from a day count alone.
 */
export function countWorkingDays(start: Date, end: Date, weekdays: number[] | null): number {
  const days = new Set(weekdays ?? MON_TO_FRI);
  let count = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    if (days.has(mondayFirst(new Date(t)))) count++;
  }
  return count;
}

/** A statutory "week" of leave is the person's normal working week. */
export function weeksToWorkingDays(weeks: number, daysPerWeek: number): number {
  return weeks * daysPerWeek;
}

/**
 * Pro-rata a full-year entitlement for someone who starts part-way through
 * the leave year, the way GOV.UK does: the full entitlement × the months of
 * the leave year they've started ÷ 12 (the month they start in counts in
 * full), rounded up to the next half or whole day, but never above the full
 * year (22.4 days stays 22.4, not 22.5). Months run from the leave
 * year's start date (a year from 6 April has months from the 6th). No change
 * if they started before the year.
 * The entitlement is WTR reg 13(5)'s share of the leave year; the method and
 * rounding are GOV.UK's, and never give less than 13(5)'s share of days left.
 * (Reg 15A is a separate rule, on how much of it can be taken during the
 * first year of employment; Coverboard doesn't limit that.)
 * WTR reg 13(5): https://www.legislation.gov.uk/uksi/1998/1833/regulation/13
 * GOV.UK, section 3.2: https://www.gov.uk/government/publications/calculating-holiday-entitlement-for-workers/how-to-calculate-holiday-entitlement-for-workers-on-different-types-of-contract
 */
export function prorateForStartDate(
  fullEntitlement: number,
  serviceStartDate: Date | null | undefined,
  yearStart: Date,
  yearEnd: Date
): number {
  if (!serviceStartDate || serviceStartDate <= yearStart) return fullEntitlement;
  if (serviceStartDate > yearEnd) return 0;
  const monthsStarted = 12 - leaveYearMonthIndex(serviceStartDate, yearStart);
  return Math.min(fullEntitlement, roundUpToHalf((fullEntitlement * monthsStarted) / 12));
}

/** Which month of the leave year (0–11) a date falls in. */
function leaveYearMonthIndex(date: Date, yearStart: Date): number {
  const y = yearStart.getUTCFullYear();
  const m = yearStart.getUTCMonth();
  const day = yearStart.getUTCDate();
  let index = 0;
  for (let k = 1; k < 12; k++) {
    // The k-th month starts on the same day of the month, or the month's last
    // day when it's shorter (a year from 31 January has a month from 28 February).
    const lastDay = new Date(Date.UTC(y, m + k + 1, 0)).getUTCDate();
    const boundary = new Date(Date.UTC(y, m + k, Math.min(day, lastDay)));
    if (boundary <= date) index = k;
  }
  return index;
}

/** Up to the next half or whole day; never down. */
function roundUpToHalf(days: number): number {
  return Math.ceil(Number((days * 2).toFixed(6))) / 2;
}

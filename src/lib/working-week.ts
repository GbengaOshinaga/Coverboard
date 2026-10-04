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
 * the leave year: the share of the year from their start date, rounded UP to
 * a whole day (rounding down is not allowed). No change if they started
 * before the year.
 */
export function prorateForStartDate(
  fullEntitlement: number,
  serviceStartDate: Date | null | undefined,
  yearStart: Date,
  yearEnd: Date
): number {
  if (!serviceStartDate || serviceStartDate <= yearStart) return fullEntitlement;
  if (serviceStartDate > yearEnd) return 0;
  const yearDays = Math.round((yearEnd.getTime() - yearStart.getTime()) / DAY_MS) + 1;
  const remaining = Math.round((yearEnd.getTime() - serviceStartDate.getTime()) / DAY_MS) + 1;
  return Math.ceil((fullEntitlement * remaining) / yearDays);
}

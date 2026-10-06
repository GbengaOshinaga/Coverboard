/**
 * The leave year, defined once. Each team sets when its leave year starts
 * (1 January by default; 1 April is common). A leave year is identified by
 * the calendar year it starts in: with a 1 April start, "2026" runs from
 * 1 April 2026 to 31 March 2027 and is shown as "2026/27".
 *
 * Everything that means "this year" for holiday uses it: entitlement and
 * proration, carry-over and its expiry, holiday usage, and the yearly limit
 * on unpaid parental leave. Analytics charts stay on calendar years.
 * https://www.gov.uk/holiday-entitlement-rights/entitlement
 */

export type LeaveYearStart = {
  /** 1–12. */
  month: number;
  /** 1–28, so every year has the day. */
  day: number;
};

export const CALENDAR_LEAVE_YEAR: LeaveYearStart = { month: 1, day: 1 };

const DAY_MS = 86_400_000;

function startOf(year: number, s: LeaveYearStart): Date {
  return new Date(Date.UTC(year, s.month - 1, s.day));
}

/** The leave year a date falls in (the year that leave year starts in). */
export function leaveYearOf(date: Date, s: LeaveYearStart): number {
  const y = date.getUTCFullYear();
  return date >= startOf(y, s) ? y : y - 1;
}

/** First day (00:00 UTC) and last day (23:59:59.999 UTC) of a leave year. */
export function leaveYearBounds(year: number, s: LeaveYearStart): { start: Date; end: Date } {
  return { start: startOf(year, s), end: new Date(startOf(year + 1, s).getTime() - 1) };
}

/** "2026" for calendar leave years, "2026/27" otherwise. */
export function leaveYearLabel(year: number, s: LeaveYearStart): string {
  if (s.month === 1 && s.day === 1) return String(year);
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

/**
 * The first date with this month and day after a leave year ends, e.g. the
 * company's carry-over expiry ("31 March") for leave carried out of a year.
 */
export function firstDateAfterYear(year: number, s: LeaveYearStart, month: number, day: number): Date {
  const after = leaveYearBounds(year, s).end;
  let candidate = new Date(Date.UTC(after.getUTCFullYear(), month - 1, day, 23, 59, 59, 999));
  if (candidate <= after) {
    candidate = new Date(Date.UTC(after.getUTCFullYear() + 1, month - 1, day, 23, 59, 59, 999));
  }
  return candidate;
}

/**
 * The year end to process at the rollover: the one that's just ended until
 * halfway through the next year, then the one coming up.
 */
export function rolloverLeaveYear(now: Date, s: LeaveYearStart): number {
  const current = leaveYearOf(now, s);
  const { start } = leaveYearBounds(current, s);
  return now.getTime() - start.getTime() < 182 * DAY_MS ? current - 1 : current;
}

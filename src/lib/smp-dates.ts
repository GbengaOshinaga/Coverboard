/**
 * Maternity dates, defined once (client-safe: no database).
 * https://www.gov.uk/employers-maternity-pay-leave
 *
 *  - Expected week of childbirth (EWC): the Sunday–Saturday week the baby is due.
 *  - Qualifying week: 15 weeks before the EWC. SMP needs 26 weeks' service by
 *    then, and average earnings are taken from the 8 weeks up to it.
 *  - Leave: up to 52 weeks (26 ordinary + 26 additional).
 */

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function qualifyingWeek(dueDate: Date): { start: Date; end: Date } {
  const due = utcDay(dueDate);
  const ewcSunday = new Date(due.getTime() - due.getUTCDay() * DAY_MS);
  const start = new Date(ewcSunday.getTime() - 15 * 7 * DAY_MS);
  return { start, end: new Date(start.getTime() + 6 * DAY_MS) };
}

/**
 * Earnings for SMP come from the 8 weeks before this date (exclusive): the
 * day after the qualifying week, or — with no due date — the leave start.
 */
export function smpEarningsCutoff(input: { expectedDueDate: Date | null; startDate: Date }): Date {
  return input.expectedDueDate
    ? new Date(qualifyingWeek(input.expectedDueDate).end.getTime() + DAY_MS)
    : utcDay(input.startDate);
}

/** The last day maternity leave can run to: 52 weeks from the start. */
export function maternityLeaveLatestEnd(startDate: Date): Date {
  return new Date(utcDay(startDate).getTime() + (52 * 7 - 1) * DAY_MS);
}

/**
 * Weekly statutory pay (SPP, SMP) is for 7 calendar days a week: full weeks
 * pay the weekly rate, part weeks a seventh of it per day, rounded up to the
 * penny.
 */
export function weeklyStatutoryPayFor(weeklyRate: number, calendarDays: number): number {
  if (weeklyRate <= 0 || calendarDays <= 0) return 0;
  const fullWeeks = Math.floor(calendarDays / 7);
  const rest = calendarDays - fullWeeks * 7;
  const part = Math.ceil(Number((((rest * weeklyRate) / 7) * 100).toFixed(6))) / 100;
  return Number((fullWeeks * weeklyRate + part).toFixed(2));
}

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1;

/**
 * SMP for the days of a pay period: on maternity leave, within the 39-week
 * pay period, split between the 6 weeks at 90% and the 33 weeks after.
 * Phase ends are the stored boundaries: the day after each phase.
 */
export function smpPayInPeriod(input: {
  leaveStart: Date;
  leaveEnd: Date;
  /** Day after the 6 weeks (exclusive). */
  phase1End: Date;
  /** Day after the 39 weeks (exclusive). */
  phase2End: Date;
  phase1Weekly: number | null;
  phase2Weekly: number | null;
  from: Date;
  to: Date;
}): { phase1Days: number; phase2Days: number; pay: number | null } {
  const max = (a: Date, b: Date) => (a > b ? a : b);
  const min = (a: Date, b: Date) => (a < b ? a : b);
  const start = max(utcDay(input.leaveStart), utcDay(input.from));
  const end = min(min(utcDay(input.leaveEnd), utcDay(input.to)), new Date(utcDay(input.phase2End).getTime() - DAY_MS));
  if (end < start) return { phase1Days: 0, phase2Days: 0, pay: input.phase1Weekly === null ? null : 0 };
  const lastPhase1Day = new Date(utcDay(input.phase1End).getTime() - DAY_MS);
  const phase1Days = start <= lastPhase1Day ? daysBetween(start, min(end, lastPhase1Day)) : 0;
  const phase2Start = max(start, utcDay(input.phase1End));
  const phase2Days = phase2Start <= end ? daysBetween(phase2Start, end) : 0;
  if (input.phase1Weekly === null || input.phase2Weekly === null) return { phase1Days, phase2Days, pay: null };
  return {
    phase1Days,
    phase2Days,
    pay: Number(
      (weeklyStatutoryPayFor(input.phase1Weekly, phase1Days) + weeklyStatutoryPayFor(input.phase2Weekly, phase2Days)).toFixed(2)
    ),
  };
}

/** The last day of a phase whose stored end is the day after it. */
export function lastDayBefore(exclusiveEnd: Date): Date {
  return new Date(utcDay(exclusiveEnd).getTime() - DAY_MS);
}

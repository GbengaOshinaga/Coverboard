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

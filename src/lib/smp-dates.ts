/**
 * Maternity and adoption pay dates, defined once (client-safe: no database).
 * https://www.gov.uk/employers-maternity-pay-leave
 * https://www.gov.uk/employers-adoption-pay-leave
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

/** The Sunday–Saturday week containing a date (statutory pay weeks). */
export function weekContaining(date: Date): { start: Date; end: Date } {
  const day = utcDay(date);
  const start = new Date(day.getTime() - day.getUTCDay() * DAY_MS);
  return { start, end: new Date(start.getTime() + 6 * DAY_MS) };
}

/**
 * Adoption: the matching week is the week the adopter was told they'd been
 * matched with the child. Statutory Adoption Pay needs 26 weeks' service into
 * it, and earnings come from the 8 weeks up to it, as SMP does with the
 * qualifying week (SPP and SAP (General) Regulations 2002, reg 40).
 * https://www.gov.uk/employers-adoption-pay-leave/eligibility
 */
export const matchingWeek = weekContaining;

/**
 * The latest employment start that gives 26 weeks' continuous employment
 * into a test week (qualifying or matching week): weeks run Sunday–Saturday
 * and a week counts if they were employed for any part of it, so it's the
 * Saturday 25 weeks before the test week.
 */
export function latestStartForService(testWeek: { start: Date; end: Date }): Date {
  return new Date(testWeek.end.getTime() - 25 * 7 * DAY_MS);
}

/** SMP for maternity, SAP for adoption. */
export type BirthPayKind = "SMP" | "SAP";

export function birthPayKind(leaveTypeName: string | null | undefined): BirthPayKind | null {
  if (!leaveTypeName) return null;
  if (/maternity/i.test(leaveTypeName)) return "SMP";
  if (/adoption/i.test(leaveTypeName)) return "SAP";
  return null;
}

/**
 * The week that sets the service test and the earnings period: the
 * qualifying week (maternity, from the due date) or the matching week
 * (adoption). null when the date isn't recorded.
 */
export function payTestWeek(input: {
  kind: BirthPayKind;
  expectedDueDate: Date | null;
  matchedDate: Date | null;
}): { start: Date; end: Date } | null {
  if (input.kind === "SAP") return input.matchedDate ? matchingWeek(input.matchedDate) : null;
  return input.expectedDueDate ? qualifyingWeek(input.expectedDueDate) : null;
}

/**
 * Earnings for SMP or SAP come from the 8 weeks before this date
 * (exclusive): the day after the qualifying or matching week, or — with no
 * date recorded — the leave start.
 */
export function smpEarningsCutoff(input: {
  kind?: BirthPayKind;
  expectedDueDate: Date | null;
  matchedDate?: Date | null;
  startDate: Date;
}): Date {
  const week = payTestWeek({
    kind: input.kind ?? "SMP",
    expectedDueDate: input.expectedDueDate,
    matchedDate: input.matchedDate ?? null,
  });
  return week ? new Date(week.end.getTime() + DAY_MS) : utcDay(input.startDate);
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

/** Shared Parental Pay is paid for at most 37 weeks for a child. */
export const SHPP_MAX_WEEKS = 37;

/**
 * Weeks of Shared Parental Pay for a child: the 39 weeks of SMP or SAP less
 * the weeks the mother or adopter used (at least the 2 compulsory weeks), so
 * 37 at most. `smpWeeksUsed` is null when the app doesn't hold them (the
 * other parent's employer pays them): then 37, the most it can be.
 */
export function shppPoolWeeks(smpWeeksUsed: number | null): number {
  if (smpWeeksUsed === null) return SHPP_MAX_WEEKS;
  return Math.max(0, 39 - Math.max(2, smpWeeksUsed));
}

/**
 * SMP or SAP weeks used: paid weeks are 7 calendar days, so a part week of
 * leave counts as a week used (the rest of it can't be shared).
 */
export function smpWeeksUsed(leave: Array<{ startDate: Date; endDate: Date }>): number {
  const days = leave.reduce(
    (s, r) => s + Math.max(0, Math.round((utcDay(r.endDate).getTime() - utcDay(r.startDate).getTime()) / DAY_MS) + 1),
    0
  );
  return Math.min(39, Math.ceil(days / 7));
}

/**
 * Checks a new ShPP claim against the weeks of pay for one child: the
 * employee's other ShPP-claimed bookings for the same child plus this one, in
 * calendar days (pay weeks are 7 calendar days), within `poolWeeks`
 * (shppPoolWeeks). The other parent's claims share the same pool; the app only
 * sees this employee's.
 */
export function shppClaimError(input: {
  request: { startDate: Date; endDate: Date };
  otherClaims: Array<{ startDate: Date; endDate: Date }>;
  poolWeeks?: number;
}): string | null {
  const days = (r: { startDate: Date; endDate: Date }) =>
    Math.max(0, Math.round((utcDay(r.endDate).getTime() - utcDay(r.startDate).getTime()) / DAY_MS) + 1);
  const pool = input.poolWeeks ?? SHPP_MAX_WEEKS;
  const used = input.otherClaims.reduce((s, r) => s + days(r), 0);
  const total = used + days(input.request);
  const max = pool * 7;
  if (total <= max) return null;
  const left = Math.max(0, max - used);
  return `That's more than the ${pool} weeks of Shared Parental Pay for this child (${max} days). ${left} day${left === 1 ? "" : "s"} of pay left; book the rest as unpaid shared parental leave.`;
}

/**
 * Which date sets the qualifying or matching week for paternity or shared
 * parental pay: the matching date (adoption), else the due date (birth).
 * With only the actual birth date, it stands in for the due date (close,
 * but the law uses the due week), and the pay explanation says so.
 */
export function parentPayDates(input: {
  expectedDueDate: Date | null;
  matchedDate: Date | null;
  childBirthDate?: Date | null;
}): { expectedDueDate: Date | null; matchedDate: Date | null; note: string | null } {
  if (input.matchedDate) return { expectedDueDate: null, matchedDate: input.matchedDate, note: null };
  if (input.expectedDueDate) return { expectedDueDate: input.expectedDueDate, matchedDate: null, note: null };
  if (input.childBirthDate) {
    return {
      expectedDueDate: input.childBirthDate,
      matchedDate: null,
      note: "Worked out from the birth date; add the due date if it was a different week.",
    };
  }
  return {
    expectedDueDate: null,
    matchedDate: null,
    note: "No due or matching date recorded, so earnings are from before the leave starts.",
  };
}

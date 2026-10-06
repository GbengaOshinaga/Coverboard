/**
 * Holiday carry-over, defined once: what a year's carry-over adds to the
 * allowance as it's used and expires, and what carries into the next year at
 * year end.
 *
 * Three kinds, each with its own expiry:
 *  - COMPANY_POLICY: the team's own carry-over (capped, expiry set in Settings).
 *  - SICKNESS: leave someone couldn't take because they were off sick. Up to
 *    the 4 weeks of regulation 13 leave (all of it for irregular-hours staff),
 *    to be taken within 18 months of the end of the leave year it arose in.
 *    WTR reg. 13(15), reg. 15D(4).
 *  - FAMILY_LEAVE: leave someone couldn't take because of maternity,
 *    paternity, adoption, shared parental, bereavement or neonatal care leave.
 *    All of it: the 4 weeks and the extra 1.6 (at most 28 days). Carries into
 *    the next leave year. WTR reg. 13(14), reg. 13A(7A), reg. 15D(3).
 * https://www.legislation.gov.uk/uksi/1998/1833/regulation/13
 * https://www.legislation.gov.uk/uksi/1998/1833/regulation/13A
 * https://www.legislation.gov.uk/uksi/1998/1833/regulation/15D
 *
 * Leave years follow the team's leave year (src/lib/leave-year.ts).
 */

export type CarryOverReason = "COMPANY_POLICY" | "SICKNESS" | "FAMILY_LEAVE";

/** Weeks that must carry over when sickness prevented them (reg. 13 leave). */
export const STATUTORY_CARRY_WEEKS = 4;
/** After family leave, all 5.6 weeks: reg. 13 leave and the extra 1.6 (reg. 13A(7A)). */
export const FAMILY_CARRY_WEEKS = 5.6;

export type CarryRow = {
  reason: CarryOverReason;
  /** Days, or hours for irregular-hours staff. */
  carried: number;
  /** null: doesn't expire within the year. */
  expiresAt: Date | null;
};

export type CarryPart = CarryRow & {
  /** Taken from this carry-over so far (leave on or before its expiry). */
  used: number;
  /** Expired unused, so no longer in the allowance. */
  lapsed: number;
  /** Still available. */
  remaining: number;
  expired: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Carry-over is used before this year's own leave, soonest-expiring first:
 * leave taken on or before a carry-over's expiry comes out of it. When a
 * carry-over expires, only the unused part lapses — leave already taken from
 * it stays taken (it used to vanish from the allowance after being used).
 *
 * @param takenBy leave taken or booked in the year up to and including a date
 *                (null: the whole year).
 * @returns parts in expiry order, and what they add to the allowance.
 */
export function carryOverInEffect(
  rows: ReadonlyArray<CarryRow>,
  takenBy: (date: Date | null) => number,
  now: Date
): { parts: CarryPart[]; allowance: number } {
  const ordered = [...rows].sort(
    (a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity)
  );
  let allocated = 0;
  const parts = ordered.map((row) => {
    const used = round2(Math.min(row.carried, Math.max(0, takenBy(row.expiresAt) - allocated)));
    allocated += used;
    const expired = row.expiresAt !== null && row.expiresAt < now;
    const unused = round2(row.carried - used);
    return {
      ...row,
      used,
      expired,
      lapsed: expired ? unused : 0,
      remaining: expired ? 0 : unused,
    };
  });
  return { parts, allowance: round2(parts.reduce((s, p) => s + p.used + p.remaining, 0)) };
}

export type YearEndInput = {
  fromYear: number;
  /** Last moment of the leave year ending (src/lib/leave-year.ts leaveYearBounds). */
  yearEnd: Date;
  /** "hours" for irregular-hours staff: their whole entitlement can carry. */
  unit: "days" | "hours";
  /** This year's own entitlement, without carry-over. */
  entitlement: number;
  /** Carry-over that came into this year. */
  carriedIn: ReadonlyArray<CarryRow>;
  /** Leave taken in the year up to a date (null: all of it). */
  takenBy: (date: Date | null) => number;
  /** Days worked per week, for the 4-week statutory limit. */
  daysPerWeek: number;
  /** Irregular-hours staff: their average day, to turn days off into hours. */
  avgHoursPerDay: number;
  /** Working days off in the year, sick and on family leave. */
  sicknessDays: number;
  familyLeaveDays: number;
  /** The admin can decide someone could have taken their leave anyway. */
  includeStatutory: boolean;
  company: { enabled: boolean; max: number; expiresAt: Date };
};

export type YearEndRow = CarryRow & {
  expiresAt: Date;
  /** Why: brought forward from an earlier year, or this year's leave. */
  source: "brought_forward" | "this_year";
};

export type YearEndPlan = {
  /** This year's own entitlement not taken (before any carries over). */
  unused: number;
  rows: YearEndRow[];
};

/** 23:59:59.999 UTC on a day. */
/** The last moment before a date `months` months after the day after `yearEnd`. */
function monthsAfterYearEnd(yearEnd: Date, months: number): Date {
  const next = new Date(yearEnd.getTime() + 1); // first moment of the next leave year
  return new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + months, next.getUTCDate()) - 1);
}

/** 18 months after the leave year ends (30 June two years on, for a calendar year). */
export function sicknessCarryExpiry(yearEnd: Date): Date {
  return monthsAfterYearEnd(yearEnd, 18);
}

/** The end of the following leave year. */
export function familyLeaveCarryExpiry(yearEnd: Date): Date {
  return monthsAfterYearEnd(yearEnd, 12);
}

/**
 * What carries into `fromYear + 1` for one person and leave type.
 *
 *  1. Carry-over from earlier years that hasn't expired by the year end (only
 *     sickness carry-over lasts that long) comes forward, minus what was used.
 *  2. If they had sickness or family leave, the statutory carry-over: the
 *     untaken part of the 4 weeks (all untaken leave for irregular-hours
 *     staff), up to the days they were off.
 *  3. The company carry-over from what's left, up to the team's cap.
 */
export function planYearEndCarryOver(input: YearEndInput): YearEndPlan {
  const yearEnd = input.yearEnd;
  const { parts } = carryOverInEffect(input.carriedIn, input.takenBy, yearEnd);
  const usedFromCarry = parts.reduce((s, p) => s + p.used, 0);
  const usedFromEntitlement = Math.max(0, input.takenBy(null) - usedFromCarry);
  const unused = round2(Math.max(0, input.entitlement - usedFromEntitlement));
  let left = unused;

  const rows: YearEndRow[] = parts.flatMap((p) =>
    !p.expired && p.expiresAt !== null && p.expiresAt > yearEnd && p.remaining > 0
      ? [{ reason: p.reason, carried: p.remaining, expiresAt: p.expiresAt, source: "brought_forward" as const }]
      : []
  );

  // The law covers leave they couldn't take because they were off, so never
  // more than the time they were off: a year's maternity leave carries all of
  // it, one sick day at most one day. (Hours: their days off × average day.)
  const cap = (days: number) => (input.unit === "hours" ? days * input.avgHoursPerDay : days);
  let carriedThisYear = 0;
  const statutory = (reason: "FAMILY_LEAVE" | "SICKNESS", offDays: number, limitDays: number) => {
    if (!input.includeStatutory || offDays <= 0 || left <= 0) return;
    // Irregular-hours staff carry all untaken hours (reg. 15D); others the
    // untaken part of the statutory weeks this reason covers.
    const untakenStatutory =
      input.unit === "hours" ? left : Math.max(0, limitDays - usedFromEntitlement - carriedThisYear);
    const owed = round2(Math.min(cap(offDays), left, untakenStatutory));
    if (owed <= 0) return;
    rows.push({
      reason,
      carried: owed,
      expiresAt: reason === "FAMILY_LEAVE" ? familyLeaveCarryExpiry(yearEnd) : sicknessCarryExpiry(yearEnd),
      source: "this_year",
    });
    carriedThisYear += owed;
    left = round2(left - owed);
  };
  // Family leave: all statutory leave they couldn't take — the 4 weeks and
  // the extra 1.6 (reg. 13(14) and 13A(7A)), at most 28 days.
  statutory("FAMILY_LEAVE", input.familyLeaveDays, Math.min(28, Math.ceil(FAMILY_CARRY_WEEKS * input.daysPerWeek)));
  // Sickness: the 4 weeks of regulation 13 leave (reg. 13(15)).
  statutory("SICKNESS", input.sicknessDays, STATUTORY_CARRY_WEEKS * input.daysPerWeek);

  if (input.company.enabled && input.company.max > 0 && left > 0) {
    rows.push({
      reason: "COMPANY_POLICY",
      carried: round2(Math.min(left, input.company.max)),
      expiresAt: input.company.expiresAt,
      source: "this_year",
    });
  }
  return { unused, rows };
}

/** Family leave for carry-over: WTR "statutory leave". */
export function isFamilyLeaveTypeName(name: string): boolean {
  return /maternity|paternity|adoption|shared parental|bereavement|neonatal/i.test(name);
}

export const CARRY_OVER_REASON_LABEL: Record<CarryOverReason, string> = {
  COMPANY_POLICY: "company carry-over",
  SICKNESS: "carried over after sickness",
  FAMILY_LEAVE: "carried over after family leave",
};

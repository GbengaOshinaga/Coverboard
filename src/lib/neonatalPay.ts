import { SMP_FLAT_RATE } from "@/lib/smpCalculator";
import { UK_LEL_WEEKLY } from "@/lib/uk-compliance";

/**
 * Statutory Neonatal Care Pay (in force 6 April 2025).
 *
 * Simpler than SMP — a single weekly rate with no phases: the **lower** of the
 * statutory flat rate (the same figure as SMP/SPP, £194.32 for 2026/27) or 90%
 * of average weekly earnings. Payable for up to 12 weeks (one week per 7 full
 * days the baby spent in neonatal care).
 *
 * Eligibility is the earnings test (AWE at least the Lower Earnings Limit) plus
 * 26 weeks' service, both into the right week: the qualifying or matching
 * week when they're entitled to SMP, SPP or SAP, otherwise the week before
 * the baby went into neonatal care (computeSncp in src/lib/smp-request.ts).
 * The weekly-rate helpers below are the plain formula, kept for the tests.
 */

/** Statutory cap: up to 12 weeks of Neonatal Care Pay. */
export const NEONATAL_MAX_WEEKS = 12;

/** Matches the org's "Neonatal Care Leave" type (case-insensitive). */
export function isNeonatalCareLeaveType(
  leaveTypeName: string | null | undefined
): boolean {
  return /neonatal/i.test(leaveTypeName ?? "");
}

/**
 * Weekly Neonatal Care Pay rate: the lower of the flat rate or 90% of AWE.
 * Returns 0 when AWE is unknown/zero (caller surfaces "no earnings history").
 */
export function calculateNeonatalWeeklyRate(
  averageWeeklyEarnings: number | null | undefined,
  flatRate: number = SMP_FLAT_RATE
): number {
  const awe = Number(averageWeeklyEarnings);
  if (!Number.isFinite(awe) || awe <= 0) return 0;
  return Number(Math.min(flatRate, awe * 0.9).toFixed(2));
}

export type NeonatalPayResult =
  | {
      eligible: true;
      weeklyRate: number;
      weeksPayable: number;
      total: number;
    }
  | {
      eligible: false;
      reason: "Below Lower Earnings Limit" | "Missing average weekly earnings";
    };

/**
 * Compute Neonatal Care Pay for a stretch of leave.
 *
 * @param weeks Weeks of neonatal care leave being taken (capped at 12).
 */
export function calculateNeonatalCarePay(input: {
  averageWeeklyEarnings: number | null | undefined;
  weeks: number;
  flatRate?: number;
  lelWeekly?: number;
}): NeonatalPayResult {
  const flatRate = input.flatRate ?? SMP_FLAT_RATE;
  const lel = input.lelWeekly ?? UK_LEL_WEEKLY;

  if (
    input.averageWeeklyEarnings === null ||
    input.averageWeeklyEarnings === undefined
  ) {
    return { eligible: false, reason: "Missing average weekly earnings" };
  }
  if (Number(input.averageWeeklyEarnings) < lel) {
    return { eligible: false, reason: "Below Lower Earnings Limit" };
  }

  const weeksPayable = Math.max(
    0,
    Math.min(Math.ceil(input.weeks), NEONATAL_MAX_WEEKS)
  );
  const weeklyRate = calculateNeonatalWeeklyRate(
    input.averageWeeklyEarnings,
    flatRate
  );
  return {
    eligible: true,
    weeklyRate,
    weeksPayable,
    total: Number((weeklyRate * weeksPayable).toFixed(2)),
  };
}

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const daysInclusive = (a: Date, b: Date) => Math.round((utcDay(b).getTime() - utcDay(a).getTime()) / DAY_MS) + 1;

/** Neonatal care leave must all be taken within 68 weeks of the birth. */
export const NEONATAL_DEADLINE_WEEKS = 68;

/**
 * Weeks of neonatal care leave and pay: one for every 7 consecutive full days
 * in neonatal care, up to 12 (none under 7 days). The dates are the first and
 * last full days in care; while the baby is still in care, days count to
 * `today`.
 * https://www.gov.uk/employers-neonatal-care-pay-leave
 */
export function neonatalWeeksEntitled(input: {
  firstFullDay: Date;
  lastFullDay: Date | null;
  today?: Date;
}): { weeks: number; daysInCare: number; ongoing: boolean } {
  const ongoing = input.lastFullDay === null;
  const last = input.lastFullDay ?? utcDay(input.today ?? new Date());
  const daysInCare = Math.max(0, daysInclusive(input.firstFullDay, last));
  return { weeks: Math.min(NEONATAL_MAX_WEEKS, Math.floor(daysInCare / 7)), daysInCare, ongoing };
}

/**
 * Checks a neonatal care leave booking: within the weeks the time in care
 * gives (across their bookings for this baby, in calendar days) and within
 * 68 weeks of the birth.
 */
export function neonatalBookingError(input: {
  request: { startDate: Date; endDate: Date };
  otherBookings: Array<{ startDate: Date; endDate: Date }>;
  entitledWeeks: number;
  ongoing: boolean;
  birthDate: Date | null;
}): string | null {
  if (input.birthDate) {
    const deadline = new Date(utcDay(input.birthDate).getTime() + (NEONATAL_DEADLINE_WEEKS * 7 - 1) * DAY_MS);
    if (utcDay(input.request.endDate) > deadline) {
      const by = deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
      return `Neonatal care leave has to be taken within ${NEONATAL_DEADLINE_WEEKS} weeks of the birth (by ${by}).`;
    }
  }
  if (input.entitledWeeks === 0) {
    return input.ongoing
      ? "Neonatal care leave needs 7 full days in neonatal care in a row. Book it once the baby has been in care for a week."
      : "Neonatal care leave needs at least 7 full days in neonatal care in a row.";
  }
  const used = input.otherBookings.reduce((s, b) => s + daysInclusive(b.startDate, b.endDate), 0);
  const allowed = input.entitledWeeks * 7;
  if (used + daysInclusive(input.request.startDate, input.request.endDate) > allowed) {
    const left = Math.max(0, allowed - used);
    return `That's more than the ${input.entitledWeeks} week${input.entitledWeeks === 1 ? "" : "s"} of neonatal care leave the time in care gives (${allowed} days). ${left} day${left === 1 ? "" : "s"} left${input.ongoing ? "; more weeks build up while the baby is still in care" : ""}.`;
  }
  return null;
}

/**
 * The week whose 8 weeks of earnings and 26 weeks' service set Neonatal Care
 * Pay when the employee isn't entitled to SMP, SPP or SAP: the week before the
 * week the baby went into neonatal care (Sunday–Saturday weeks).
 */
export function weekBeforeNeonatalCare(firstFullDay: Date): { start: Date; end: Date } {
  const day = utcDay(firstFullDay);
  const thisSunday = new Date(day.getTime() - day.getUTCDay() * DAY_MS);
  const start = new Date(thisSunday.getTime() - 7 * DAY_MS);
  return { start, end: new Date(start.getTime() + 6 * DAY_MS) };
}

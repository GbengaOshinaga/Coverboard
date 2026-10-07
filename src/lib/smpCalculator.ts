/**
 * Statutory Maternity Pay (SMP) calculations.
 *
 * SMP has two phases:
 *   • Phase 1 (weeks 1–6):  90% of Average Weekly Earnings (AWE)
 *   • Phase 2 (weeks 7–39): the LOWER of the statutory flat rate
 *                           or 90% AWE
 *
 * AWE is the average earnings over the relevant 8-week period ending
 * with the qualifying week (roughly 15 weeks before the expected week
 * of childbirth). The caller is responsible for supplying the correct
 * 8-week slice; this module simply averages the numbers it's given.
 *
 * The flat weekly rate is read from `SMP_WEEKLY_RATE` / `SMP_FLAT_RATE`
 * env vars (both accepted; `SMP_FLAT_RATE` wins if both are set), with
 * a 2026/27 fallback of £194.32.
 *
 * References:
 *   • https://www.gov.uk/maternity-pay-leave/pay
 *   • https://www.gov.uk/employers-maternity-pay-leave
 */

import { UK_LEL_WEEKLY } from "@/lib/uk-compliance";
import { latestStartForService, qualifyingWeek } from "@/lib/smp-dates";

const DEFAULT_SMP_FLAT_RATE = 194.32;

/**
 * Statutory SMP flat weekly rate for 2026/27 (as of 6 April 2026).
 * Update each April via HMRC guidance.
 */
export const SMP_FLAT_RATE = Number(
  process.env.SMP_FLAT_RATE ?? process.env.SMP_WEEKLY_RATE ?? DEFAULT_SMP_FLAT_RATE
);

/** Phase boundaries, in weeks from SMP start. */
export const SMP_PHASE_1_WEEKS = 6;
export const SMP_PHASE_2_WEEKS = 39;

/**
 * Average Weekly Earnings over the relevant 8-week period.
 *
 * Divides the total by 8 per HMRC rules — callers must supply the
 * correct 8-week slice. An empty array returns 0 rather than NaN so
 * the value is safe to persist as a DECIMAL.
 *
 * @param weeklyEarnings Array of (up to) 8 weeks of gross earnings.
 */
export function calculateAWE(
  weeklyEarnings: number[],
  periodWeeks = 8
): number {
  if (weeklyEarnings.length === 0) return 0;
  const weeks = Math.max(1, Math.round(periodWeeks));
  const slice = weeklyEarnings.slice(-weeks);
  const total = slice.reduce((sum, w) => sum + Number(w || 0), 0);
  return Number((total / weeks).toFixed(2));
}

export type SMPPhaseRates = {
  /** 90% of AWE. */
  phase1Weekly: number;
  /** min(flat rate, 90% AWE). */
  phase2Weekly: number;
};

/**
 * Derive the two SMP weekly rates from AWE.
 *
 * Phase 2 is capped at the statutory flat rate but falls back to 90%
 * AWE when that is lower (e.g. for low earners — the statute says the
 * employer pays the lower of the two).
 */
export function calculateSMPPhaseRates(
  awe: number,
  flatRate: number = SMP_FLAT_RATE
): SMPPhaseRates {
  const ninetyPercent = awe * 0.9;
  const phase1 = Number(ninetyPercent.toFixed(2));
  const phase2 = Number(Math.min(flatRate, ninetyPercent).toFixed(2));
  return { phase1Weekly: phase1, phase2Weekly: phase2 };
}

export type SmpEntitlement =
  | { eligible: true; phase1Weekly: number; phase2Weekly: number }
  | {
      eligible: false;
      reason:
        | "Below Lower Earnings Limit"
        | "Missing average weekly earnings"
        | "Less than 26 weeks' continuous service";
    };

export type SmpEntitlementOpts = {
  lelWeekly?: number;
  flatRate?: number;
  /** Employee's employment start date, for the continuous-service test. */
  serviceStartDate?: Date | null;
  /** Expected week of childbirth (due date), for the qualifying week. */
  expectedDueDate?: Date | null;
  /**
   * The week service is tested into, when not the qualifying week from the
   * due date: the matching week for adoption (src/lib/smp-dates.ts).
   */
  serviceTestWeek?: { start: Date; end: Date } | null;
};

/**
 * SMP eligibility. Two statutory limbs:
 *  1. Earnings test — AWE must be at least the Lower Earnings Limit (£129 for
 *     2026/27). Below it the employee claims Maternity Allowance instead (SMP1).
 *  2. Continuous-service test — 26 weeks' continuous employment into the
 *     qualifying week (15 weeks before the expected due date), or the
 *     matching week for adoption. Sunday–Saturday weeks; any part of a week
 *     counts. Only checked when the start date and the week are known;
 *     otherwise the service limb is left for the employer.
 */
export function calculateSmpEntitlement(
  averageWeeklyEarnings: number | null | undefined,
  opts: SmpEntitlementOpts = {}
): SmpEntitlement {
  const lelWeekly = opts.lelWeekly ?? UK_LEL_WEEKLY;
  const flatRate = opts.flatRate ?? SMP_FLAT_RATE;

  if (averageWeeklyEarnings === null || averageWeeklyEarnings === undefined) {
    return { eligible: false, reason: "Missing average weekly earnings" };
  }
  if (Number(averageWeeklyEarnings) < lelWeekly) {
    return { eligible: false, reason: "Below Lower Earnings Limit" };
  }

  const testWeek =
    opts.serviceTestWeek ?? (opts.expectedDueDate ? qualifyingWeek(opts.expectedDueDate) : null);
  if (opts.serviceStartDate && testWeek) {
    if (opts.serviceStartDate > latestStartForService(testWeek)) {
      return {
        eligible: false,
        reason: "Less than 26 weeks' continuous service",
      };
    }
  }

  const rates = calculateSMPPhaseRates(Number(averageWeeklyEarnings), flatRate);
  return {
    eligible: true,
    phase1Weekly: rates.phase1Weekly,
    phase2Weekly: rates.phase2Weekly,
  };
}

/**
 * Statutory Paternity Pay: the lower of the flat rate (the same as SMP's,
 * £194.32 a week for 2026/27) and 90% of average weekly earnings, for the 1
 * or 2 weeks of paternity leave. Same earnings and service tests as SMP.
 * https://www.gov.uk/employers-paternity-pay-leave
 */
export const SPP_FLAT_RATE = SMP_FLAT_RATE;

export type PaternityPay =
  | { eligible: true; weeklyRate: number; basis: string }
  | { eligible: false; weeklyRate: null; basis: string };

export function calculatePaternityPay(
  averageWeeklyEarnings: number | null | undefined,
  opts: SmpEntitlementOpts = {}
): PaternityPay {
  const flat = opts.flatRate ?? SPP_FLAT_RATE;
  const lel = opts.lelWeekly ?? UK_LEL_WEEKLY;
  const money = (n: number) => `£${n.toFixed(2)}`;
  const e = calculateSmpEntitlement(averageWeeklyEarnings, { ...opts, flatRate: flat });
  if (!e.eligible) {
    const basis =
      e.reason === "Missing average weekly earnings"
        ? "No pay recorded in the 8 weeks before, so paternity pay can't be worked out. Add their earnings."
        : e.reason === "Below Lower Earnings Limit"
          ? `Not eligible: average weekly earnings of ${money(Number(averageWeeklyEarnings))} are below the ${money(lel)} Lower Earnings Limit.`
          : "Not eligible: less than 26 weeks' continuous service by the qualifying week.";
    return { eligible: false, weeklyRate: null, basis };
  }
  const weeklyRate = e.phase2Weekly;
  return {
    eligible: true,
    weeklyRate,
    basis:
      weeklyRate < flat
        ? `90% of ${money(Number(averageWeeklyEarnings))} average weekly earnings = ${money(weeklyRate)} a week`
        : `Flat rate of ${money(flat)} a week (90% of earnings is more)`,
  };
}

export { weeklyStatutoryPayFor } from "@/lib/smp-dates";

export type SMPPhaseDates = {
  startDate: Date;
  phase1EndDate: Date;
  phase2EndDate: Date;
};

/**
 * Compute the phase-end dates given the SMP start date.
 *
 *   phase1EndDate = start + 6 weeks
 *   phase2EndDate = start + 39 weeks (full SMP entitlement)
 *
 * All dates are returned as new `Date` instances — the input is not
 * mutated.
 */
export function calculateSMPPhaseDates(startDate: Date): SMPPhaseDates {
  const start = new Date(startDate);
  const phase1End = new Date(start);
  phase1End.setDate(phase1End.getDate() + SMP_PHASE_1_WEEKS * 7);
  const phase2End = new Date(start);
  phase2End.setDate(phase2End.getDate() + SMP_PHASE_2_WEEKS * 7);
  return { startDate: start, phase1EndDate: phase1End, phase2EndDate: phase2End };
}

export type SMPPhase = "phase_1" | "phase_2" | "ended" | "not_started";

export type CurrentSMPPhase = {
  phase: SMPPhase;
  /** Weekly rate applicable right now; `null` when outside the SMP window. */
  weeklyRate: number | null;
  /** Human-readable label e.g. "Phase 1 (90% AWE)". */
  label: string;
  phase1EndDate: Date;
  phase2EndDate: Date;
};

/**
 * Work out which SMP phase an employee is in on a given reference date
 * (defaults to today) and return the applicable weekly rate.
 */
export function getCurrentSMPPhase(params: {
  startDate: Date;
  phase1EndDate?: Date | null;
  phase2EndDate?: Date | null;
  phase1Weekly: number | null | undefined;
  phase2Weekly: number | null | undefined;
  referenceDate?: Date;
}): CurrentSMPPhase {
  const reference = params.referenceDate ?? new Date();
  const phase1End =
    params.phase1EndDate ??
    calculateSMPPhaseDates(params.startDate).phase1EndDate;
  const phase2End =
    params.phase2EndDate ??
    calculateSMPPhaseDates(params.startDate).phase2EndDate;

  if (reference < params.startDate) {
    return {
      phase: "not_started",
      weeklyRate: null,
      label: "Not started",
      phase1EndDate: phase1End,
      phase2EndDate: phase2End,
    };
  }
  if (reference < phase1End) {
    return {
      phase: "phase_1",
      weeklyRate:
        params.phase1Weekly === null || params.phase1Weekly === undefined
          ? null
          : Number(params.phase1Weekly),
      label: "Phase 1 (90% AWE)",
      phase1EndDate: phase1End,
      phase2EndDate: phase2End,
    };
  }
  if (reference < phase2End) {
    return {
      phase: "phase_2",
      weeklyRate:
        params.phase2Weekly === null || params.phase2Weekly === undefined
          ? null
          : Number(params.phase2Weekly),
      label: "Phase 2 (flat rate)",
      phase1EndDate: phase1End,
      phase2EndDate: phase2End,
    };
  }
  return {
    phase: "ended",
    weeklyRate: null,
    label: "SMP ended",
    phase1EndDate: phase1End,
    phase2EndDate: phase2End,
  };
}

export function isMaternityLeaveType(
  leaveTypeName: string | null | undefined
): boolean {
  if (!leaveTypeName) return false;
  return /maternity/i.test(leaveTypeName);
}

/**
 * Average weekly earnings for SSP / SMP: the earnings recorded in the 8 weeks
 * before `beforeDate` (the relevant period), averaged over the weeks recorded.
 * Zero-pay weeks recorded as rows count (they pull the average down, as HMRC
 * expects); unrecorded weeks are treated as missing data, not £0. Returns null
 * when nothing is recorded in the period.
 */
export async function getAweForUser(
  userId: string,
  beforeDate: Date = new Date()
): Promise<number | null> {
  // Deferred require to keep smpCalculator testable without pulling the
  // Prisma client into node:test suites that stub the DB.
  const { prisma } = await import("@/lib/prisma");
  // The relevant period is the 8 weeks before the date — not "the last 8
  // records", which could be months old.
  const windowStart = new Date(beforeDate.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.weeklyEarning.findMany({
    where: { userId, weekStartDate: { gte: windowStart, lt: beforeDate } },
    orderBy: { weekStartDate: "asc" },
  });
  return aweFromEarningRows(rows);
}

/** Like getAweForUser, with how many of the 8 weeks had pay counted. */
export async function getAweDetailForUser(
  userId: string,
  beforeDate: Date
): Promise<{ awe: number | null; weeksCounted: number }> {
  const { prisma } = await import("@/lib/prisma");
  const windowStart = new Date(beforeDate.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.weeklyEarning.findMany({
    where: { userId, weekStartDate: { gte: windowStart, lt: beforeDate } },
    orderBy: { weekStartDate: "asc" },
  });
  return { awe: aweFromEarningRows(rows), weeksCounted: countedEarningRows(rows).length };
}

/**
 * Average weekly earnings from the weeks recorded in the relevant period.
 *
 * Weeks deliberately marked as no-pay weeks (isZeroPayWeek) count as £0.
 * Weeks with no record are missing data, not £0 — dividing them in understated
 * AWE (two weeks of £360 and £420 came out as £97.50 instead of £390). A week
 * with hours worked but £0 pay and not marked as a no-pay week is the same:
 * the pay hasn't been entered, so counting it as £0 would make SSP £0.
 * Also covers new starters with fewer than 8 weeks of employment.
 */
/** Weeks that count towards average earnings (see aweFromEarningRows). */
function countedEarningRows<T extends { grossEarnings: unknown; hoursWorked: unknown; isZeroPayWeek: boolean }>(
  rows: ReadonlyArray<T>
): T[] {
  return rows.filter((r) => r.isZeroPayWeek || Number(r.grossEarnings) > 0 || Number(r.hoursWorked) <= 0);
}

export function aweFromEarningRows(
  rows: ReadonlyArray<{ grossEarnings: unknown; hoursWorked: unknown; isZeroPayWeek: boolean }>
): number | null {
  const counted = countedEarningRows(rows);
  if (counted.length === 0) return null;
  return calculateAWE(
    counted.map((r) => (r.isZeroPayWeek ? 0 : Number(r.grossEarnings))),
    counted.length
  );
}

/**
 * Recompute average weekly earnings from the 8-week relevant period (blank
 * weeks included as zero — see {@link getAweForUser}) and persist on
 * `User.averageWeeklyEarnings` for SSP / SMP / neonatal / reports. Sets the
 * field to `null` when there is no earnings history.
 */
export async function syncUserAverageWeeklyEarnings(
  userId: string,
  beforeDate: Date = new Date()
): Promise<number | null> {
  const computed = await getAweForUser(userId, beforeDate);
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: userId },
    data: { averageWeeklyEarnings: computed },
  });
  return computed;
}

/**
 * SSP / LEL checks: prefer a fresh 8-week average from weekly earnings;
 * fall back to the cached `User.averageWeeklyEarnings` when no history exists.
 */
export async function resolveAverageWeeklyEarnings(
  userId: string,
  beforeDate: Date = new Date(),
  stored: number | null | undefined = undefined
): Promise<number | null> {
  const computed = await getAweForUser(userId, beforeDate);
  if (computed !== null) {
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: userId },
      data: { averageWeeklyEarnings: computed },
    });
    return computed;
  }
  if (stored !== undefined) {
    return stored === null ? null : Number(stored);
  }
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { averageWeeklyEarnings: true },
  });
  if (user?.averageWeeklyEarnings === null || user?.averageWeeklyEarnings === undefined) {
    return null;
  }
  return Number(user.averageWeeklyEarnings);
}

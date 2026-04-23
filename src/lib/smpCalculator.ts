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
export function calculateAWE(weeklyEarnings: number[]): number {
  if (weeklyEarnings.length === 0) return 0;
  const slice = weeklyEarnings.slice(-8);
  const total = slice.reduce((sum, w) => sum + Number(w || 0), 0);
  return Number((total / 8).toFixed(2));
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
 * Pull the most recent 8 paid weeks of earnings ending at `beforeDate`
 * (exclusive) and compute AWE. Returns `null` when no earnings history
 * exists — the caller should surface a warning so payroll knows to
 * request the figure manually.
 *
 * "Paid weeks" mirrors the holiday-pay exclusion: any week flagged
 * `isZeroPayWeek` is dropped.
 */
export async function getAweForUser(
  userId: string,
  beforeDate: Date = new Date()
): Promise<number | null> {
  // Deferred require to keep smpCalculator testable without pulling the
  // Prisma client into node:test suites that stub the DB.
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.weeklyEarning.findMany({
    where: {
      userId,
      weekStartDate: { lt: beforeDate },
      isZeroPayWeek: false,
    },
    orderBy: { weekStartDate: "desc" },
    take: 8,
  });
  if (rows.length === 0) return null;
  const earnings = rows
    .map((r) => Number(r.grossEarnings))
    .reverse();
  return calculateAWE(earnings);
}

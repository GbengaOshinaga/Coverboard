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
 * a 26-week continuity-of-service requirement. The app does not track length of
 * service (no service-length gating exists anywhere), so we apply only the
 * earnings test here and leave service for the employer to confirm.
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

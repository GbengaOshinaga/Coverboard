import { NextResponse } from "next/server";
import { hasFeatureForEnum, minimumPlanFor } from "@/lib/planFeatures";
import type { AnyPlan } from "@/lib/plans";

/** Whether the signed-in user's plan includes a feature (TRIAL counts as Pro). */
export function sessionHasFeature(sessionUser: Record<string, unknown>, feature: string): boolean {
  return hasFeatureForEnum((sessionUser.plan as AnyPlan | undefined) ?? null, feature);
}

/**
 * The 403 an API sends when the plan doesn't include a feature, or null when
 * it does. `what` names the thing, e.g. "Earnings history".
 */
export function featureGate(
  sessionUser: Record<string, unknown>,
  feature: string,
  what: string
): NextResponse | null {
  if (sessionHasFeature(sessionUser, feature)) return null;
  const tier = minimumPlanFor(feature) ?? "growth";
  const plan = tier.charAt(0).toUpperCase() + tier.slice(1);
  return NextResponse.json({ error: `${what} is on the ${plan} plan and above.` }, { status: 403 });
}

/**
 * A leave request with the pay a plan doesn't include taken out: SSP figures
 * (ssp_tracking), SMP/SAP/SPP/ShPP/neonatal pay and its dates
 * (parental_leave_tracker), and the holiday pay rate (holiday_pay_calculator).
 * Pages hide these too; this keeps them out of the raw API responses.
 */
export function withoutGatedPay<T extends object>(row: T, sessionUser: Record<string, unknown>): T {
  const out = { ...row } as Record<string, unknown>;
  if (!sessionHasFeature(sessionUser, "ssp_tracking")) {
    for (const k of ["sspDailyRate", "sspAverageWeeklyEarnings", "sspDaysPaid", "sspLimitReached"]) {
      if (k in out) out[k] = null;
    }
  }
  if (!sessionHasFeature(sessionUser, "parental_leave_tracker")) {
    for (const k of [
      "smpAverageWeeklyEarnings",
      "smpPhase1WeeklyRate",
      "smpPhase2WeeklyRate",
      "smpPhase1EndDate",
      "smpPhase2EndDate",
      "smpEarningsWeeks",
    ]) {
      if (k in out) out[k] = null;
    }
    delete out.shpp;
    delete out.spp;
    delete out.neonatal;
  }
  if (!sessionHasFeature(sessionUser, "holiday_pay_calculator") && "dailyHolidayPayRate" in out) {
    out.dailyHolidayPayRate = null;
  }
  return out as T;
}

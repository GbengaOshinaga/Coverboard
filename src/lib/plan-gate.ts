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

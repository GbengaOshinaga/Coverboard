/**
 * Subscription plan helpers. Mirrors Prisma enum `SubscriptionPlan`.
 */

export const SUBSCRIPTION_PLANS = ["STARTER", "GROWTH", "SCALE", "PRO"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * The full Prisma enum including TRIAL/LOCKED lifecycle states.
 * TRIAL gets full feature access (handled in planFeatures.ts).
 * LOCKED gets nothing — tier helpers here return false for both.
 */
export type AnyPlan = SubscriptionPlan | "TRIAL" | "LOCKED";

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  STARTER: 0,
  GROWTH: 1,
  SCALE: 2,
  PRO: 3,
};

function isPaidTier(plan: AnyPlan | null | undefined): plan is SubscriptionPlan {
  return plan === "STARTER" || plan === "GROWTH" || plan === "SCALE" || plan === "PRO";
}

/** Returns true if `plan` is at or above `minimum` in the tier order. */
export function planAtLeast(
  plan: AnyPlan | null | undefined,
  minimum: SubscriptionPlan
): boolean {
  if (!isPaidTier(plan)) return false;
  return PLAN_RANK[plan] >= PLAN_RANK[minimum];
}

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  SCALE: "Scale",
  PRO: "Pro",
};

/**
 * Default maximum admin users per plan. `0` means unlimited.
 */
export const PLAN_DEFAULT_MAX_ADMINS: Record<SubscriptionPlan, number> = {
  STARTER: 2,
  GROWTH: 0,
  SCALE: 0,
  PRO: 0,
};

/** Whether the plan unlocks priority support response targets. */
export function hasPrioritySupport(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(plan, "SCALE");
}

/** Whether the plan unlocks the SLA-backed support tier (1-hour target). */
export function hasSlaSupport(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(plan, "PRO");
}

/** Whether the plan includes a dedicated onboarding session. */
export function hasDedicatedOnboarding(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(plan, "PRO");
}

/** Whether the plan unlocks external API access. */
export function hasApiAccess(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(plan, "PRO");
}

/** Whether the plan unlocks the audit trail viewer & export. */
export function hasAuditTrail(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(plan, "PRO");
}

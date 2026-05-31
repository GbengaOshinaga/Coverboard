/**
 * Subscription plan helpers. Mirrors Prisma enum `SubscriptionPlan`.
 */

export const SUBSCRIPTION_PLANS = [
  "FREE",
  "STARTER",
  "GROWTH",
  "SCALE",
  "PRO",
] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * The full Prisma enum including TRIAL/LOCKED lifecycle states.
 * TRIAL gets full feature access (handled here + in planFeatures.ts).
 * LOCKED gets nothing.
 */
export type AnyPlan = SubscriptionPlan | "TRIAL" | "LOCKED";

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  FREE: 0,
  STARTER: 1,
  GROWTH: 2,
  SCALE: 3,
  PRO: 4,
};

/**
 * Whether the plan is one a customer can actually be billed against. FREE
 * isn't billed (no Stripe subscription); TRIAL/LOCKED are lifecycle states.
 */
function isRankedTier(plan: AnyPlan | null | undefined): plan is SubscriptionPlan {
  return (
    plan === "FREE" ||
    plan === "STARTER" ||
    plan === "GROWTH" ||
    plan === "SCALE" ||
    plan === "PRO"
  );
}

function normalizeForFeatureGate(
  plan: AnyPlan | null | undefined
): SubscriptionPlan | "LOCKED" | null | undefined {
  if (plan === "TRIAL") return "PRO";
  return plan;
}

/** Returns true if `plan` is at or above `minimum` in the tier order. */
export function planAtLeast(
  plan: AnyPlan | null | undefined,
  minimum: SubscriptionPlan
): boolean {
  if (!isRankedTier(plan)) return false;
  return PLAN_RANK[plan] >= PLAN_RANK[minimum];
}

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE: "Free",
  STARTER: "Starter",
  GROWTH: "Growth",
  SCALE: "Scale",
  PRO: "Pro",
};

/**
 * Maximum admin users per plan. `0` means unlimited. Free intentionally
 * sized at 1 so a co-founder pair already needs Starter — the headcount
 * cap (5) is the harder gate, but admins create a second nudge.
 */
export const PLAN_DEFAULT_MAX_ADMINS: Record<SubscriptionPlan, number> = {
  FREE: 1,
  STARTER: 2,
  GROWTH: 5,
  SCALE: 0,
  PRO: 0,
};

/**
 * Maximum active employees (users) per plan. `0` means unlimited. The team
 * roster API rejects invites past this limit; existing rosters that exceed
 * the limit (e.g. after a downgrade) are not retroactively deactivated.
 */
export const PLAN_MAX_EMPLOYEES: Record<SubscriptionPlan, number> = {
  FREE: 5,
  STARTER: 15,
  GROWTH: 0,
  SCALE: 0,
  PRO: 0,
};

/**
 * Resolve the max-admins value for any plan including lifecycle states.
 * TRIAL gets Pro-equivalent access (unlimited); LOCKED returns 0 (the lock
 * middleware short-circuits these requests anyway). Returns `Infinity` for
 * unlimited tiers so callers can do a single numeric compare without
 * special-casing zero.
 */
export function maxAdminsForPlan(plan: AnyPlan | null | undefined): number {
  if (!plan || plan === "LOCKED") return 0;
  const effective = plan === "TRIAL" ? "PRO" : plan;
  const raw = PLAN_DEFAULT_MAX_ADMINS[effective];
  return raw === 0 ? Infinity : raw;
}

/**
 * Resolve the max-employees value for any plan. Same lifecycle handling as
 * `maxAdminsForPlan` — TRIAL → Pro-equivalent, LOCKED → 0, unlimited tiers
 * → Infinity.
 */
export function maxEmployeesForPlan(plan: AnyPlan | null | undefined): number {
  if (!plan || plan === "LOCKED") return 0;
  const effective = plan === "TRIAL" ? "PRO" : plan;
  const raw = PLAN_MAX_EMPLOYEES[effective];
  return raw === 0 ? Infinity : raw;
}

/** Whether the plan unlocks priority response targets. */
export function hasPrioritySupport(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(normalizeForFeatureGate(plan), "SCALE");
}

/** Whether the plan unlocks the SLA-backed response tier (1-hour target). */
export function hasSlaSupport(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(normalizeForFeatureGate(plan), "PRO");
}

/** Whether the plan unlocks external API access. */
export function hasApiAccess(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(normalizeForFeatureGate(plan), "PRO");
}

/** Whether the plan unlocks the audit trail viewer & export. */
export function hasAuditTrail(
  plan: AnyPlan | null | undefined
): boolean {
  return planAtLeast(normalizeForFeatureGate(plan), "PRO");
}

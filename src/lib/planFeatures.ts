/**
 * Feature gating by subscription plan.
 *
 * The keys below are the lowercase names used throughout the codebase. For
 * API/DB-level gating where the Prisma enum is UPPERCASE (FREE/STARTER/…),
 * use hasFeatureForEnum() which maps TRIAL → pro (full access during trial)
 * and LOCKED → empty set (no features after cancellation).
 *
 * Admin headcount limits are NOT feature flags — they live in
 * PLAN_DEFAULT_MAX_ADMINS in `plans.ts` and are checked numerically.
 * Employee headcount limits live in PLAN_MAX_EMPLOYEES the same way.
 *
 * Marketing copy on the pricing page advertises features that may not all
 * be runtime-gated yet (e.g. "scheduled report delivery"). The flags here
 * cover only features actually wired into the codebase. As new features
 * land, add their flags to the appropriate tier.
 */

type PlanKey =
  | "free"
  | "starter"
  | "growth"
  | "scale"
  | "pro"
  | "trial"
  | "locked";

const FREE_FEATURES = [
  "annual_leave",
  "employee_portal",
  "team_calendar",
  "leave_requests",
  "email_notifications",
] as const;

const STARTER_FEATURES = [
  ...FREE_FEATURES,
  "pro_rata",
  "carry_over_rules",
  "bank_holiday_config",
] as const;

const GROWTH_FEATURES = [
  ...STARTER_FEATURES,
  "ssp_tracking",
  "parental_leave_tracker",
  "kit_split_days",
  "right_to_work",
  "bradford_factor",
  "holiday_pay_calculator",
  "earnings_history",
] as const;

const SCALE_FEATURES = [
  ...GROWTH_FEATURES,
  "absence_analytics",
  "compliance_reports",
  "priority_support",
  "custom_leave_policies",
] as const;

const PRO_FEATURES = [
  ...SCALE_FEATURES,
  "audit_exports",
] as const;

export const PLAN_FEATURES: Record<PlanKey, readonly string[]> = {
  free: FREE_FEATURES,
  starter: STARTER_FEATURES,
  growth: GROWTH_FEATURES,
  scale: SCALE_FEATURES,
  pro: PRO_FEATURES,
  // Trial gets full access so users experience the product before deciding.
  trial: PRO_FEATURES,
  locked: [],
};

export function hasFeature(plan: string | null | undefined, feature: string): boolean {
  if (!plan) return false;
  const bucket = PLAN_FEATURES[plan.toLowerCase() as PlanKey];
  return bucket?.includes(feature) ?? false;
}

/** Prisma enum → lowercase key */
export function planEnumToKey(
  plan: "TRIAL" | "FREE" | "STARTER" | "GROWTH" | "SCALE" | "PRO" | "LOCKED"
): PlanKey {
  return plan.toLowerCase() as PlanKey;
}

/** Convenience: gate by the uppercase Prisma enum directly. */
export function hasFeatureForEnum(
  plan:
    | "TRIAL"
    | "FREE"
    | "STARTER"
    | "GROWTH"
    | "SCALE"
    | "PRO"
    | "LOCKED"
    | null
    | undefined,
  feature: string
): boolean {
  if (!plan) return false;
  return hasFeature(planEnumToKey(plan), feature);
}

/**
 * Minimum plan tier that grants a given feature. Used in upgrade prompts
 * so the UI can say "available on Growth and above".
 */
export function minimumPlanFor(feature: string): PlanKey | null {
  const order: PlanKey[] = ["free", "starter", "growth", "scale", "pro"];
  for (const tier of order) {
    if (PLAN_FEATURES[tier].includes(feature)) return tier;
  }
  return null;
}

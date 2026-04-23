/**
 * Feature gating by subscription plan.
 *
 * The keys below are the lowercase names used throughout the Stripe
 * integration. For API/DB-level gating where the Prisma enum is
 * UPPERCASE (STARTER/GROWTH/…), use hasFeatureForEnum() which maps
 * TRIAL → pro (full access) and LOCKED → empty set.
 */

type PlanKey = "starter" | "growth" | "scale" | "pro" | "trial" | "locked";

const STARTER_FEATURES = [
  "annual_leave",
  "employee_portal",
  "team_calendar",
  "leave_requests",
  "email_notifications",
  "max_admins_2",
] as const;

const GROWTH_FEATURES = [
  ...STARTER_FEATURES,
  "bradford_factor",
  "pro_rata",
  "bank_holiday_config",
  "right_to_work",
  "ssp_tracking",
  "unlimited_admins",
] as const;

const SCALE_FEATURES = [
  ...GROWTH_FEATURES,
  "parental_leave_tracker",
  "kit_split_days",
  "earnings_history",
  "holiday_pay_calculator",
  "carry_over_rules",
  "absence_analytics",
  "compliance_reports",
  "priority_support",
] as const;

const PRO_FEATURES = [
  ...SCALE_FEATURES,
  "onboarding_call",
  "custom_leave_policies",
  "gdpr_data_residency",
  "api_access",
  "audit_exports",
] as const;

export const PLAN_FEATURES: Record<PlanKey, readonly string[]> = {
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
  plan: "TRIAL" | "STARTER" | "GROWTH" | "SCALE" | "PRO" | "LOCKED"
): PlanKey {
  return plan.toLowerCase() as PlanKey;
}

/** Convenience: gate by the uppercase Prisma enum directly. */
export function hasFeatureForEnum(
  plan: "TRIAL" | "STARTER" | "GROWTH" | "SCALE" | "PRO" | "LOCKED" | null | undefined,
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
  const order: PlanKey[] = ["starter", "growth", "scale", "pro"];
  for (const tier of order) {
    if (PLAN_FEATURES[tier].includes(feature)) return tier;
  }
  return null;
}

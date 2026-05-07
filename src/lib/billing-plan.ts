import {
  planKeyFromPriceId,
  type StripePlanKey,
} from "@/config/stripePrices";

type BillingPlanSource = {
  plan: string;
  stripePriceId: string | null;
};

export function planKeyForBilling(org: BillingPlanSource): StripePlanKey {
  if (org.stripePriceId) {
    const key = planKeyFromPriceId(org.stripePriceId);
    if (key) return key;
  }

  const key = org.plan.toLowerCase();
  if (key === "starter" || key === "growth" || key === "scale" || key === "pro") {
    return key;
  }

  // Signup defaults to Growth. If Stripe provisioning failed before persisting
  // a price id, this keeps billing recovery aligned with that path.
  return "growth";
}

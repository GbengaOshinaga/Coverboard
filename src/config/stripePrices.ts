/**
 * Stripe price IDs — populated by running `npx tsx scripts/createStripeProducts.ts`.
 * Do NOT hardcode real IDs in tests; they can also be overridden via env for
 * separate dev/stage/live accounts.
 */
export const STRIPE_PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "price_starter_placeholder",
  growth: process.env.STRIPE_PRICE_GROWTH ?? "price_growth_placeholder",
  scale: process.env.STRIPE_PRICE_SCALE ?? "price_scale_placeholder",
  pro: process.env.STRIPE_PRICE_PRO ?? "price_pro_placeholder",
} as const;

export type StripePlanKey = keyof typeof STRIPE_PRICE_IDS;

export const PLAN_KEY_TO_ENUM: Record<
  StripePlanKey,
  "STARTER" | "GROWTH" | "SCALE" | "PRO"
> = {
  starter: "STARTER",
  growth: "GROWTH",
  scale: "SCALE",
  pro: "PRO",
};

export function planKeyFromPriceId(priceId: string): StripePlanKey | null {
  const entry = (Object.entries(STRIPE_PRICE_IDS) as Array<[StripePlanKey, string]>)
    .find(([, id]) => id === priceId);
  return entry?.[0] ?? null;
}

export const PLAN_MONTHLY_PRICE_GBP: Record<StripePlanKey, number> = {
  starter: 19,
  growth: 49,
  scale: 99,
  pro: 179,
};

export const PLAN_DISPLAY_NAME: Record<StripePlanKey, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  pro: "Pro",
};

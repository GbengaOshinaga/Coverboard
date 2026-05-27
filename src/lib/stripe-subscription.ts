import type Stripe from "stripe";

/** Unix end of the current billing period (subscription or first item). */
export function readCurrentPeriodEndSec(sub: Stripe.Subscription): number | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof top === "number") return top;
  const item = sub.items.data[0]?.current_period_end;
  return typeof item === "number" ? item : null;
}

/** Best date to show when access ends (period end, trial end, or Stripe cancel_at). */
export function subscriptionAccessEndDate(sub: Stripe.Subscription): Date | null {
  const periodEndSec = readCurrentPeriodEndSec(sub);
  if (periodEndSec) return new Date(periodEndSec * 1000);
  if (sub.trial_end) return new Date(sub.trial_end * 1000);
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000);
  return null;
}

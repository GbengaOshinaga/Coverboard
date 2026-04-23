import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" })
  : null;

export function assertStripe(): Stripe {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment."
    );
  }
  return stripe;
}

export function isStripeConfigured(): boolean {
  return !!stripe;
}

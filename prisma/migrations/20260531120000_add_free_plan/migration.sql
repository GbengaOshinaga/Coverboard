-- Add FREE as a new subscription tier. Sits below STARTER and is the
-- destination for sub-5-employee teams. No Stripe subscription attached.

ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'FREE';

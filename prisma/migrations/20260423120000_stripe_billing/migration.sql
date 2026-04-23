-- Add TRIAL + LOCKED to SubscriptionPlan enum
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'LOCKED';

-- New Stripe/billing fields on Organization (all nullable / default false so existing rows unaffected)
ALTER TABLE "Organization"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "stripePriceId" TEXT,
  ADD COLUMN "subscriptionStatus" TEXT,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "cardAdded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "paidPlanStartedAt" TIMESTAMP(3);

-- Teams already on a paid plan have had their welcome: mark them so a later
-- recovery from a failed payment doesn't send it again.
UPDATE "Organization" SET "paidPlanStartedAt" = COALESCE("updatedAt", NOW())
WHERE "plan" IN ('STARTER', 'GROWTH', 'SCALE', 'PRO');

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_receivedAt_idx" ON "StripeWebhookEvent"("receivedAt");

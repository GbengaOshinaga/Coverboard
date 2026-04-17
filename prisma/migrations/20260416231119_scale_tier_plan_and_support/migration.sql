-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'GROWTH', 'SCALE', 'PRO');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER';

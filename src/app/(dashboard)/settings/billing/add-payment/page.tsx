import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PLAN_DISPLAY_NAME,
  PLAN_MONTHLY_PRICE_GBP,
  type StripePlanKey,
} from "@/config/stripePrices";
import { planKeyForBilling } from "@/lib/billing-plan";
import { AddPaymentForm } from "./add-payment-form";

const UPGRADE_PLAN_KEYS: StripePlanKey[] = [
  "starter",
  "growth",
  "scale",
  "pro",
];

export default async function AddPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ update?: string; plan?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") redirect("/dashboard");

  const { update, plan: planQuery } = await searchParams;
  const updateMode = update === "1" || update === "true";

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      plan: true,
      stripePriceId: true,
      trialEndsAt: true,
      cardAdded: true,
      subscriptionStatus: true,
    },
  });

  if (!org) redirect("/dashboard");

  // Free → Paid upgrade: the change-plan page passes ?plan=<tier>. Validate
  // it strictly — if it's missing, unknown, or the org isn't on FREE, fall
  // back to the standard add-payment flow.
  const upgradeToPlanKey: StripePlanKey | null =
    org.plan === "FREE" &&
    typeof planQuery === "string" &&
    UPGRADE_PLAN_KEYS.includes(planQuery.toLowerCase() as StripePlanKey)
      ? (planQuery.toLowerCase() as StripePlanKey)
      : null;

  // Display: upgrade mode shows the chosen tier; otherwise show whatever
  // the org has stored (or the fallback default).
  const displayPlanKey = upgradeToPlanKey ?? planKeyForBilling(org);
  const planName = PLAN_DISPLAY_NAME[displayPlanKey];
  const planPrice = PLAN_MONTHLY_PRICE_GBP[displayPlanKey];

  const hasActiveTrial =
    org.subscriptionStatus === "trialing" &&
    org.trialEndsAt !== null &&
    org.trialEndsAt.getTime() > Date.now();
  const trialEndFormatted = hasActiveTrial
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(org.trialEndsAt!)
    : "";

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  return (
    <div className="mx-auto max-w-lg py-4">
      <AddPaymentForm
        publishableKey={publishableKey}
        planName={planName}
        planPriceGbp={planPrice}
        trialEndFormatted={trialEndFormatted}
        alreadyAdded={org.cardAdded}
        updateMode={updateMode}
        upgradeToPlanKey={upgradeToPlanKey}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  planKeyFromPriceId,
  PLAN_DISPLAY_NAME,
  PLAN_MONTHLY_PRICE_GBP,
  type StripePlanKey,
} from "@/config/stripePrices";
import { AddPaymentForm } from "./add-payment-form";

function planKeyForBilling(org: {
  plan: string;
  stripePriceId: string | null;
}): StripePlanKey {
  if (org.stripePriceId) {
    const key = planKeyFromPriceId(org.stripePriceId);
    if (key) return key;
  }

  const key = org.plan.toLowerCase();
  if (key === "starter" || key === "growth" || key === "scale" || key === "pro") {
    return key;
  }

  // Signup defaults to Growth. If Stripe provisioning failed before persisting
  // a price id, this keeps add-payment recovery aligned with that path.
  return "growth";
}

export default async function AddPaymentPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") redirect("/dashboard");

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

  const planKey = planKeyForBilling(org);
  const planName = PLAN_DISPLAY_NAME[planKey];
  const planPrice = PLAN_MONTHLY_PRICE_GBP[planKey];

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
      />
    </div>
  );
}

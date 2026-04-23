import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planKeyFromPriceId, PLAN_DISPLAY_NAME, PLAN_MONTHLY_PRICE_GBP } from "@/config/stripePrices";
import { AddPaymentForm } from "./add-payment-form";

export default async function AddPaymentPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") redirect("/dashboard");

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      stripePriceId: true,
      trialEndsAt: true,
      cardAdded: true,
      subscriptionStatus: true,
    },
  });

  if (!org) redirect("/dashboard");

  const planKey = org.stripePriceId
    ? planKeyFromPriceId(org.stripePriceId)
    : null;
  const planName = planKey ? PLAN_DISPLAY_NAME[planKey] : "your plan";
  const planPrice = planKey ? PLAN_MONTHLY_PRICE_GBP[planKey] : null;

  const trialEndFormatted = org.trialEndsAt
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(org.trialEndsAt)
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

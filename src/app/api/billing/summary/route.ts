import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { planKeyFromPriceId, PLAN_DISPLAY_NAME, PLAN_MONTHLY_PRICE_GBP } from "@/config/stripePrices";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      cardAdded: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: true,
    },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const planKey = org.stripePriceId ? planKeyFromPriceId(org.stripePriceId) : null;
  const planName = planKey ? PLAN_DISPLAY_NAME[planKey] : null;
  const planPriceGbp = planKey ? PLAN_MONTHLY_PRICE_GBP[planKey] : null;

  type InvoiceDTO = {
    id: string;
    number: string | null;
    amount: number;
    currency: string;
    status: string | null;
    created: number;
    pdf: string | null;
  };
  let invoices: InvoiceDTO[] = [];
  if (stripe && org.stripeCustomerId) {
    try {
      const list = await stripe.invoices.list({
        customer: org.stripeCustomerId,
        limit: 5,
      });
      invoices = list.data.map((inv) => ({
        id: inv.id ?? "",
        number: inv.number,
        amount: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        created: inv.created,
        pdf: inv.invoice_pdf ?? null,
      }));
    } catch (err) {
      console.error("Failed to list Stripe invoices:", err);
    }
  }

  return NextResponse.json({
    plan: org.plan,
    planName,
    planPriceGbp,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    cardAdded: org.cardAdded,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    currentPeriodEnd: org.currentPeriodEnd,
    invoices,
  });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { planKeyFromPriceId, PLAN_DISPLAY_NAME, PLAN_MONTHLY_PRICE_GBP } from "@/config/stripePrices";
import { subscriptionAccessEndDate } from "@/lib/stripe-subscription";

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
      deletionScheduledFor: true,
      deletionReason: true,
      trialExpiredGraceEndsAt: true,
    },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  let currentPeriodEnd = org.currentPeriodEnd;
  if (
    stripe &&
    org.stripeSubscriptionId &&
    org.cancelAtPeriodEnd &&
    !currentPeriodEnd
  ) {
    try {
      const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      const accessEnd = subscriptionAccessEndDate(sub);
      if (accessEnd) {
        currentPeriodEnd = accessEnd;
        await prisma.organization.update({
          where: { id: orgId },
          data: { currentPeriodEnd: accessEnd },
        });
      }
    } catch (err) {
      console.error("Failed to hydrate subscription period end:", err);
    }
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
  let paymentMethodBrand: string | null = null;
  let paymentMethodLast4: string | null = null;

  if (stripe && org.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(org.stripeCustomerId, {
        expand: ["invoice_settings.default_payment_method"],
      });
      if (customer && !("deleted" in customer && customer.deleted)) {
        const pm = customer.invoice_settings?.default_payment_method;
        if (pm && typeof pm === "object" && "card" in pm && pm.card) {
          paymentMethodBrand = pm.card.brand ?? null;
          paymentMethodLast4 = pm.card.last4 ?? null;
        }
      }
    } catch (err) {
      console.error("Failed to retrieve Stripe customer:", err);
    }

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
    paymentMethodBrand,
    paymentMethodLast4,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    currentPeriodEnd,
    deletionScheduledFor: org.deletionScheduledFor,
    deletionReason: org.deletionReason,
    trialExpiredGraceEndsAt: org.trialExpiredGraceEndsAt,
    invoices,
  });
}

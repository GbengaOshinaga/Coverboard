import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { cancelScheduledDeletion } from "@/lib/deletionScheduler";
import { emailDeletionCanceled } from "@/lib/billing-emails";
import {
  STRIPE_PRICE_IDS,
  planKeyFromPriceId,
  type StripePlanKey,
} from "@/config/stripePrices";
import { z } from "zod";

const schema = z.object({
  paymentMethodId: z.string().min(1),
});

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

  // If Stripe provisioning failed during signup, the selected checkout plan may
  // not have been persisted. Match the signup default so recovery can proceed.
  return "growth";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      trialEndsAt: true,
    },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  try {
    let stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: (sessionUser.email as string | undefined) ?? undefined,
        name: org.name,
        metadata: {
          organization_id: org.id,
          admin_user_id: (sessionUser.id as string | undefined) ?? "",
        },
      });
      stripeCustomerId = customer.id;
      await prisma.organization.update({
        where: { id: orgId },
        data: { stripeCustomerId },
      });
    }

    await stripe.paymentMethods.attach(parsed.data.paymentMethodId, {
      customer: stripeCustomerId,
    });

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: parsed.data.paymentMethodId },
    });

    let stripeSubscriptionId = org.stripeSubscriptionId;
    let stripePriceId = org.stripePriceId;
    if (stripeSubscriptionId) {
      await stripe.subscriptions.update(stripeSubscriptionId, {
        default_payment_method: parsed.data.paymentMethodId,
      });
    } else {
      const planKey = planKeyForBilling(org);
      stripePriceId = STRIPE_PRICE_IDS[planKey];
      const trialEnd =
        org.trialEndsAt && org.trialEndsAt.getTime() > Date.now()
          ? Math.floor(org.trialEndsAt.getTime() / 1000)
          : undefined;
      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: stripePriceId }],
        default_payment_method: parsed.data.paymentMethodId,
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        metadata: {
          organization_id: orgId,
          plan_key: planKey,
        },
      });
      stripeSubscriptionId = subscription.id;
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId,
        cardAdded: true,
        trialExpiredGraceEndsAt: null,
      },
    });

    const { wasScheduled } = await cancelScheduledDeletion({
      organizationId: orgId,
      canceledBy: (sessionUser.email as string) ?? "add-payment",
    });
    if (wasScheduled) {
      const adminEmail = sessionUser.email as string | undefined;
      if (adminEmail) {
        await emailDeletionCanceled({ to: adminEmail }).catch((err) =>
          console.error("Deletion-canceled email failed:", err)
        );
      }
    }

    return NextResponse.json({ success: true, deletionCanceled: wasScheduled });
  } catch (err: unknown) {
    const code = (err as { code?: string; message?: string })?.code;
    const message = (err as { message?: string })?.message ?? "Unknown error";
    console.error("Failed to confirm payment method:", err);
    if (code === "card_declined") {
      return NextResponse.json(
        { error: "Your card was declined. Please try a different card." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: message || "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

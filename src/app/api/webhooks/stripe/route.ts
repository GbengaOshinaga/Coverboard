// SETUP INSTRUCTIONS:
// 1. Install Stripe CLI:
//    https://stripe.com/docs/stripe-cli
// 2. Run locally:
//    stripe listen --forward-to localhost:3000/api/webhooks/stripe
// 3. Copy the webhook signing secret to STRIPE_WEBHOOK_SECRET in .env.local
// 4. In production, add the webhook endpoint in
//    Stripe Dashboard → Developers → Webhooks
//    URL: https://yourcoverboard.app/api/webhooks/stripe
//    Events to enable:
//    - customer.subscription.trial_will_end
//    - customer.subscription.updated
//    - customer.subscription.deleted
//    - customer.subscription.paused
//    - invoice.payment_succeeded
//    - invoice.payment_failed

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { planKeyFromPriceId, PLAN_KEY_TO_ENUM, PLAN_DISPLAY_NAME } from "@/config/stripePrices";
import {
  emailTrialEndingSoon,
  emailPaymentFailed,
  emailSubscriptionCanceled,
  emailWelcomeActive,
  emailAccountPaused,
  emailDeletionScheduled,
  emailDeletionCanceled,
} from "@/lib/billing-emails";
import {
  scheduleDeletion,
  cancelScheduledDeletion,
  setTrialGracePeriod,
  DELETION_GRACE_DAYS,
} from "@/lib/deletionScheduler";

export const runtime = "nodejs";
// App Router does not parse the body when we read it as text, so signature
// verification on the raw bytes works as long as we call request.text().

async function getOrgByCustomerId(customerId: string) {
  return prisma.organization.findUnique({
    where: { stripeCustomerId: customerId },
    include: {
      users: {
        where: { role: "ADMIN" },
        select: { email: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const org = await getOrgByCustomerId(sub.customer as string);
  if (!org) return;

  const priceId = sub.items.data[0]?.price?.id ?? org.stripePriceId ?? null;
  const planKey = priceId ? planKeyFromPriceId(priceId) : null;

  let nextPlan = org.plan;
  if (sub.status === "active" && planKey) {
    nextPlan = PLAN_KEY_TO_ENUM[planKey];
  }

  const currentPeriodEndSec =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items.data[0]?.current_period_end ??
    null;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: sub.status,
      stripePriceId: priceId,
      plan: nextPlan,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : org.trialEndsAt,
      currentPeriodEnd: currentPeriodEndSec
        ? new Date(currentPeriodEndSec * 1000)
        : org.currentPeriodEnd,
    },
  });

  if (sub.status === "past_due") {
    const adminEmail = org.users[0]?.email;
    if (adminEmail) await emailPaymentFailed({ to: adminEmail });
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const org = await getOrgByCustomerId(sub.customer as string);
  if (!org) return;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: "canceled",
      plan: "LOCKED",
      cancelAtPeriodEnd: false,
    },
  });

  const { scheduledFor } = await scheduleDeletion({
    organizationId: org.id,
    reason: "subscription_canceled",
  });

  const adminEmail = org.users[0]?.email;
  if (adminEmail) {
    await emailSubscriptionCanceled({ to: adminEmail });
    await emailDeletionScheduled({
      to: adminEmail,
      scheduledFor,
      reason: "subscription_canceled",
    });
  }
}

async function handleSubscriptionPaused(sub: Stripe.Subscription) {
  const org = await getOrgByCustomerId(sub.customer as string);
  if (!org) return;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: "paused",
      plan: "LOCKED",
    },
  });

  await setTrialGracePeriod({ organizationId: org.id });

  const adminEmail = org.users[0]?.email;
  if (adminEmail) {
    await emailAccountPaused({ to: adminEmail, daysUntilDeletion: DELETION_GRACE_DAYS });
  }
}

async function handleTrialWillEnd(sub: Stripe.Subscription) {
  const org = await getOrgByCustomerId(sub.customer as string);
  if (!org) return;
  const adminEmail = org.users[0]?.email;
  if (adminEmail) await emailTrialEndingSoon({ to: adminEmail, daysLeft: 3 });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const org = await getOrgByCustomerId(customerId);
  if (!org) return;

  const wasTrialing = org.subscriptionStatus === "trialing";
  const rawPrice = invoice.lines.data[0]?.pricing?.price_details?.price;
  const priceId =
    typeof rawPrice === "string"
      ? rawPrice
      : rawPrice?.id ?? org.stripePriceId ?? null;
  const planKey = priceId ? planKeyFromPriceId(priceId) : null;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: "active",
      cardAdded: true,
      plan: planKey ? PLAN_KEY_TO_ENUM[planKey] : org.plan,
      trialExpiredGraceEndsAt: null,
    },
  });

  const { wasScheduled } = await cancelScheduledDeletion({
    organizationId: org.id,
    canceledBy: "invoice.payment_succeeded",
  });

  const adminEmail = org.users[0]?.email;
  if (wasTrialing) {
    const planName = planKey ? PLAN_DISPLAY_NAME[planKey] : "Coverboard";
    if (adminEmail) await emailWelcomeActive({ to: adminEmail, planName });
  }
  if (wasScheduled && adminEmail) {
    await emailDeletionCanceled({ to: adminEmail });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const org = await getOrgByCustomerId(customerId);
  if (!org) return;

  await prisma.organization.update({
    where: { id: org.id },
    data: { subscriptionStatus: "past_due" },
  });

  const adminEmail = org.users[0]?.email;
  if (adminEmail) await emailPaymentFailed({ to: adminEmail });
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, signingSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.paused":
        await handleSubscriptionPaused(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Unhandled event types: return 200 so Stripe doesn't retry.
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    // Still return 200 so Stripe doesn't hammer us; error is logged.
  }

  return NextResponse.json({ received: true });
}

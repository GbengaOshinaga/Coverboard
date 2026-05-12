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
} from "@/lib/deletionScheduler";
import {
  dispatchStripeEvent,
  type OrgRecord,
  type WebhookDeps,
} from "@/lib/stripe-webhook-handlers";

export const runtime = "nodejs";
// App Router does not parse the body when we read it as text, so signature
// verification on the raw bytes works as long as we call request.text().

async function findOrgByCustomerId(customerId: string): Promise<OrgRecord | null> {
  const org = await prisma.organization.findUnique({
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
  if (!org) return null;
  return {
    id: org.id,
    plan: org.plan,
    stripePriceId: org.stripePriceId,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    currentPeriodEnd: org.currentPeriodEnd,
    adminEmail: org.users[0]?.email ?? null,
  };
}

const deps: WebhookDeps = {
  findOrgByCustomerId,
  async updateOrganization(id, data) {
    await prisma.organization.update({ where: { id }, data });
  },
  scheduleDeletion,
  cancelScheduledDeletion,
  setTrialGracePeriod,
  emailers: {
    trialEndingSoon: emailTrialEndingSoon,
    paymentFailed: emailPaymentFailed,
    subscriptionCanceled: emailSubscriptionCanceled,
    welcomeActive: emailWelcomeActive,
    accountPaused: emailAccountPaused,
    deletionScheduled: emailDeletionScheduled,
    deletionCanceled: emailDeletionCanceled,
  },
};

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
    await dispatchStripeEvent(event, deps);
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    // Still return 200 so Stripe doesn't hammer us; error is logged.
  }

  return NextResponse.json({ received: true });
}

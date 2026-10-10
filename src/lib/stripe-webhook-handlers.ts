import type Stripe from "stripe";
import { planKeyFromPriceId, PLAN_KEY_TO_ENUM, PLAN_DISPLAY_NAME } from "@/config/stripePrices";
import { DELETION_GRACE_DAYS } from "@/lib/deletionScheduler";
import { subscriptionAccessEndDate } from "@/lib/stripe-subscription";

export type PlanEnum =
  | "TRIAL"
  | "FREE"
  | "STARTER"
  | "GROWTH"
  | "SCALE"
  | "PRO"
  | "LOCKED";

export type OrgRecord = {
  id: string;
  plan: PlanEnum;
  stripePriceId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  adminEmail: string | null;
};

export type OrgUpdate = {
  subscriptionStatus?: string;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  plan?: PlanEnum;
  cancelAtPeriodEnd?: boolean;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  cardAdded?: boolean;
  trialExpiredGraceEndsAt?: Date | null;
};

export type DeletionReason =
  | "trial_expired"
  | "subscription_canceled"
  | "user_requested"
  | "payment_failed_grace_expired";

export type WebhookDeps = {
  findOrgByCustomerId(customerId: string): Promise<OrgRecord | null>;
  updateOrganization(id: string, data: OrgUpdate): Promise<void>;
  scheduleDeletion(params: {
    organizationId: string;
    reason: DeletionReason;
  }): Promise<{ scheduledFor: Date }>;
  cancelScheduledDeletion(params: {
    organizationId: string;
    canceledBy?: string | null;
  }): Promise<{ wasScheduled: boolean }>;
  setTrialGracePeriod(params: {
    organizationId: string;
  }): Promise<{ graceEndsAt: Date }>;
  /** Why the team doesn't fit a plan (more people or admins), or null. */
  headcountOverPlan(organizationId: string, plan: PlanEnum, planName: string): Promise<string | null>;
  /** Every active admin's email (billing warnings go to all of them). */
  adminEmails(organizationId: string): Promise<string[]>;
  emailers: {
    trialEndingSoon(args: { to: string; daysLeft: number }): Promise<void>;
    planTooSmall(args: { to: string; problem: string; trialEnding: boolean }): Promise<void>;
    paymentFailed(args: { to: string }): Promise<void>;
    subscriptionCanceled(args: { to: string }): Promise<void>;
    welcomeActive(args: { to: string; planName: string }): Promise<void>;
    accountPaused(args: { to: string; daysUntilDeletion: number }): Promise<void>;
    deletionScheduled(args: {
      to: string;
      scheduledFor: Date;
      reason: DeletionReason;
    }): Promise<void>;
    deletionCanceled(args: { to: string }): Promise<void>;
  };
};

export async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  deps: WebhookDeps,
  /** What this event changed, as Stripe sends it (event.data.previous_attributes). */
  previous?: Partial<Stripe.Subscription>
): Promise<void> {
  const org = await deps.findOrgByCustomerId(sub.customer as string);
  if (!org) return;

  const priceId = sub.items.data[0]?.price?.id ?? org.stripePriceId ?? null;
  const planKey = priceId ? planKeyFromPriceId(priceId) : null;

  // Only promote the Prisma plan enum when the subscription is fully active.
  // Trialing/past-due/etc. keep whatever plan they had so feature gating stays
  // consistent (TRIAL → pro bundle; LOCKED → none).
  const nextPlan: PlanEnum =
    sub.status === "active" && planKey ? PLAN_KEY_TO_ENUM[planKey] : org.plan;

  const accessEnd = subscriptionAccessEndDate(sub);

  await deps.updateOrganization(org.id, {
    subscriptionStatus: sub.status,
    stripePriceId: priceId,
    plan: nextPlan,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : org.trialEndsAt,
    currentPeriodEnd: accessEnd ?? org.currentPeriodEnd,
  });

  if (sub.status === "past_due" && org.adminEmail) {
    await deps.emailers.paymentFailed({ to: org.adminEmail });
  }

  // The trial has just ended and the plan begun. Told by what Stripe says
  // this event changed, not by our stored status: the payment-succeeded
  // event can arrive first and mark the team active, and Stripe doesn't
  // promise an order.
  if (previous?.status === "trialing" && sub.status === "active") {
    if (org.adminEmail) {
      await deps.emailers.welcomeActive({ to: org.adminEmail, planName: planKey ? PLAN_DISPLAY_NAME[planKey] : "Coverboard" });
    }
    // Converted onto a plan the team has outgrown: the app sends admins to
    // Billing until it fits (overPlan in the session); tell them, and us.
    const problem = await planTooSmallFor(org, priceId, deps);
    if (problem) {
      console.warn(`[billing] org ${org.id} converted from trial onto a plan it has outgrown: ${problem}`);
      await emailAllAdmins(org.id, deps, (to) => deps.emailers.planTooSmall({ to, problem, trialEnding: false }));
    }
  }
}

async function emailAllAdmins(organizationId: string, deps: WebhookDeps, send: (to: string) => Promise<void>) {
  for (const to of await deps.adminEmails(organizationId)) await send(to);
}

export async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  deps: WebhookDeps
): Promise<void> {
  const org = await deps.findOrgByCustomerId(sub.customer as string);
  if (!org) return;

  // Two distinct cancellation flows feed into this handler:
  //
  //   1) Customer-initiated DOWNGRADE to the Free tier. The
  //      `/api/billing/downgrade-to-free` endpoint cancels the subscription
  //      at period end with `metadata.downgrade_target = "free"`. When the
  //      period actually expires we move the org to FREE, NOT LOCKED, and
  //      skip scheduling deletion — the customer keeps using Coverboard on
  //      the free tier.
  //
  //   2) Plain cancellation (or hard failure). Plan drops to LOCKED and a
  //      30-day deletion is scheduled, as before.
  const downgradeTarget = (sub.metadata?.downgrade_target ?? "").toLowerCase();

  if (downgradeTarget === "free") {
    await deps.updateOrganization(org.id, {
      subscriptionStatus: "canceled",
      plan: "FREE",
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
      stripePriceId: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
    });
    return;
  }

  await deps.updateOrganization(org.id, {
    subscriptionStatus: "canceled",
    plan: "LOCKED",
    cancelAtPeriodEnd: false,
  });

  const { scheduledFor } = await deps.scheduleDeletion({
    organizationId: org.id,
    reason: "subscription_canceled",
  });

  if (org.adminEmail) {
    await deps.emailers.subscriptionCanceled({ to: org.adminEmail });
    await deps.emailers.deletionScheduled({
      to: org.adminEmail,
      scheduledFor,
      reason: "subscription_canceled",
    });
  }
}

export async function handleSubscriptionPaused(
  sub: Stripe.Subscription,
  deps: WebhookDeps
): Promise<void> {
  const org = await deps.findOrgByCustomerId(sub.customer as string);
  if (!org) return;

  await deps.updateOrganization(org.id, {
    subscriptionStatus: "paused",
    plan: "LOCKED",
  });

  await deps.setTrialGracePeriod({ organizationId: org.id });

  if (org.adminEmail) {
    await deps.emailers.accountPaused({
      to: org.adminEmail,
      daysUntilDeletion: DELETION_GRACE_DAYS,
    });
  }
}

export async function handleTrialWillEnd(
  sub: Stripe.Subscription,
  deps: WebhookDeps
): Promise<void> {
  const org = await deps.findOrgByCustomerId(sub.customer as string);
  if (!org?.adminEmail) return;
  // Grown past the plan they chose: say so while there's time to pick a
  // bigger one, since the trial turns into it without asking.
  const priceId = sub.items?.data[0]?.price?.id ?? org.stripePriceId;
  const problem = await planTooSmallFor(org, priceId, deps);
  if (problem) {
    await emailAllAdmins(org.id, deps, (to) => deps.emailers.planTooSmall({ to, problem, trialEnding: true }));
    return;
  }
  await deps.emailers.trialEndingSoon({ to: org.adminEmail, daysLeft: 3 });
}

/**
 * Whether the team has outgrown the plan a price is for. Adding people past
 * the chosen plan is refused during a trial (planForLimits), so this catches
 * teams that grew before that rule, or by rejoining or plan changes in Stripe.
 * The plan isn't changed for them: moving to a dearer plan needs their say.
 */
async function planTooSmallFor(org: OrgRecord, priceId: string | null | undefined, deps: WebhookDeps): Promise<string | null> {
  const planKey = priceId ? planKeyFromPriceId(priceId) : null;
  if (!planKey) return null;
  return deps.headcountOverPlan(org.id, PLAN_KEY_TO_ENUM[planKey], PLAN_DISPLAY_NAME[planKey]);
}

export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  deps: WebhookDeps
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const org = await deps.findOrgByCustomerId(customerId);
  if (!org) return;

  const rawPrice = invoice.lines.data[0]?.pricing?.price_details?.price;
  const priceId =
    typeof rawPrice === "string"
      ? rawPrice
      : rawPrice?.id ?? org.stripePriceId ?? null;
  const planKey = priceId ? planKeyFromPriceId(priceId) : null;

  await deps.updateOrganization(org.id, {
    subscriptionStatus: "active",
    cardAdded: true,
    plan: planKey ? PLAN_KEY_TO_ENUM[planKey] : org.plan,
    trialExpiredGraceEndsAt: null,
  });

  const { wasScheduled } = await deps.cancelScheduledDeletion({
    organizationId: org.id,
    canceledBy: "invoice.payment_succeeded",
  });

  // The welcome and outgrown-plan emails go from the subscription-updated
  // event, which says when the trial ended whatever order events arrive in.
  if (wasScheduled && org.adminEmail) {
    await deps.emailers.deletionCanceled({ to: org.adminEmail });
  }
}

export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  deps: WebhookDeps
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const org = await deps.findOrgByCustomerId(customerId);
  if (!org) return;

  await deps.updateOrganization(org.id, { subscriptionStatus: "past_due" });

  if (org.adminEmail) {
    await deps.emailers.paymentFailed({ to: org.adminEmail });
  }
}

/**
 * Routes a verified Stripe event to its handler. Unhandled types are a no-op
 * so Stripe doesn't retry.
 */
export async function dispatchStripeEvent(
  event: Stripe.Event,
  deps: WebhookDeps
): Promise<void> {
  switch (event.type) {
    case "customer.subscription.trial_will_end":
      await handleTrialWillEnd(event.data.object as Stripe.Subscription, deps);
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
        deps,
        (event.data as { previous_attributes?: Partial<Stripe.Subscription> }).previous_attributes
      );
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, deps);
      return;
    case "customer.subscription.paused":
      await handleSubscriptionPaused(event.data.object as Stripe.Subscription, deps);
      return;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, deps);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, deps);
      return;
    default:
      return;
  }
}

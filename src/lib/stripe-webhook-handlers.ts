import type Stripe from "stripe";
import { planKeyFromPriceId, PLAN_KEY_TO_ENUM, PLAN_DISPLAY_NAME } from "@/config/stripePrices";
import { DELETION_GRACE_DAYS } from "@/lib/deletionScheduler";

export type PlanEnum =
  | "TRIAL"
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
  emailers: {
    trialEndingSoon(args: { to: string; daysLeft: number }): Promise<void>;
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

function readCurrentPeriodEnd(sub: Stripe.Subscription): number | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof top === "number") return top;
  const item = sub.items.data[0]?.current_period_end;
  return typeof item === "number" ? item : null;
}

export async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  deps: WebhookDeps
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

  const periodEndSec = readCurrentPeriodEnd(sub);

  await deps.updateOrganization(org.id, {
    subscriptionStatus: sub.status,
    stripePriceId: priceId,
    plan: nextPlan,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : org.trialEndsAt,
    currentPeriodEnd: periodEndSec
      ? new Date(periodEndSec * 1000)
      : org.currentPeriodEnd,
  });

  if (sub.status === "past_due" && org.adminEmail) {
    await deps.emailers.paymentFailed({ to: org.adminEmail });
  }
}

export async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  deps: WebhookDeps
): Promise<void> {
  const org = await deps.findOrgByCustomerId(sub.customer as string);
  if (!org) return;

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
  await deps.emailers.trialEndingSoon({ to: org.adminEmail, daysLeft: 3 });
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

  const wasTrialing = org.subscriptionStatus === "trialing";
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

  if (wasTrialing && org.adminEmail) {
    const planName = planKey ? PLAN_DISPLAY_NAME[planKey] : "Coverboard";
    await deps.emailers.welcomeActive({ to: org.adminEmail, planName });
  }
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
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, deps);
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

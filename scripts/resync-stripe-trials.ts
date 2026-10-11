import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/**
 * Repairs teams that a £0 "payment succeeded" event wrongly marked as paying.
 * Stripe sends that event when a trial starts, and until 11 Oct 2026 the
 * webhook treated it as a payment: status "active", a card on file and the
 * paid plan, so trials lost their banner, card prompt and trial features.
 *
 * For every team with a Stripe subscription, reads the subscription from
 * Stripe and sets what Stripe says:
 *   - subscriptionStatus and trialEndsAt from the subscription;
 *   - cardAdded: whether the subscription or customer has a default payment method;
 *   - plan TRIAL while the subscription is still trialing;
 *   - paidPlanStartedAt cleared when no money has ever been taken, so the
 *     welcome email still goes on their first real payment.
 *
 *   npm run resync:stripe-trials            # dry run: lists what would change
 *   npm run resync:stripe-trials -- --apply # writes the changes
 */
const PAID_PLANS = new Set(["STARTER", "GROWTH", "SCALE", "PRO"]);

async function main() {
  const apply = process.argv.includes("--apply");
  if (!stripe) throw new Error("STRIPE_SECRET_KEY is not set.");

  const orgs = await prisma.organization.findMany({
    where: { stripeSubscriptionId: { not: null } },
    select: {
      id: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      cardAdded: true,
      paidPlanStartedAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  let changed = 0;
  for (const org of orgs) {
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId!, { expand: ["customer"] });
    } catch (err) {
      console.warn(`skip ${org.id} (${org.name}): could not read subscription: ${(err as Error).message}`);
      continue;
    }
    const customer = typeof sub.customer === "string" ? null : (sub.customer as Stripe.Customer);
    const hasCard = !!(sub.default_payment_method || customer?.invoice_settings?.default_payment_method);
    const paidInvoices = await stripe.invoices.list({ customer: org.stripeCustomerId!, status: "paid", limit: 100 });
    const hasPaid = paidInvoices.data.some((i) => (i.amount_paid ?? 0) > 0);

    const data: {
      subscriptionStatus?: string;
      trialEndsAt?: Date;
      cardAdded?: boolean;
      plan?: "TRIAL";
      paidPlanStartedAt?: null;
    } = {};
    if (org.subscriptionStatus !== sub.status) data.subscriptionStatus = sub.status;
    if (sub.trial_end) {
      const trialEnd = new Date(sub.trial_end * 1000);
      if (org.trialEndsAt?.getTime() !== trialEnd.getTime()) data.trialEndsAt = trialEnd;
    }
    if (org.cardAdded !== hasCard) data.cardAdded = hasCard;
    if (sub.status === "trialing" && PAID_PLANS.has(org.plan)) data.plan = "TRIAL";
    if (!hasPaid && org.paidPlanStartedAt) data.paidPlanStartedAt = null;

    if (Object.keys(data).length === 0) continue;
    changed += 1;
    const before = {
      plan: org.plan,
      subscriptionStatus: org.subscriptionStatus,
      cardAdded: org.cardAdded,
      trialEndsAt: org.trialEndsAt?.toISOString().slice(0, 10) ?? null,
      paidPlanStartedAt: org.paidPlanStartedAt ? "set" : null,
    };
    console.log(`${org.id} (${org.name})`, JSON.stringify(before), "→", JSON.stringify(data));
    if (apply) await prisma.organization.update({ where: { id: org.id }, data });
  }

  console.log(`${orgs.length} teams with a subscription checked, ${changed} ${apply ? "updated" : "would change"}.`);
  if (!apply && changed > 0) console.log("Run again with --apply to write these changes.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

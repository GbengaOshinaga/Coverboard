import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/**
 * Repairs teams that a £0 "payment succeeded" event wrongly marked as paying.
 * Stripe sends that event when a trial starts, and until 11 Oct 2026 the
 * webhook treated it as a payment: status "active", a card on file and the
 * paid plan, so trials lost their banner, card prompt and trial features.
 *
 * Reads each team's subscription from Stripe and changes only what that bug
 * could have got wrong:
 *   - Still trialing in Stripe: status and trial end as Stripe has them, the
 *     TRIAL plan, whether they have a card, and the paid-start date cleared
 *     if no money has ever been taken (so the welcome email still goes on
 *     their first real payment).
 *   - Paused (the trial ended without a card): only the card flag.
 *   - Anything else, active payers included, is listed and left alone: a
 *     payer on a 100% coupon, or whose card isn't the default, must not lose
 *     their card flag or get a second welcome.
 * "Has a card" means a default payment method or any card on the customer,
 * not counting cards that have expired.
 * A team Stripe can't be read for is reported and skipped; re-running is safe.
 *
 *   npm run resync:stripe-trials            # dry run: lists what would change
 *   npm run resync:stripe-trials -- --apply # writes the changes
 */
const PAID_PLANS = new Set(["STARTER", "GROWTH", "SCALE", "PRO"]);

/** A payment method Stripe could charge: not a card past its expiry month. */
function usable(pm: Stripe.PaymentMethod): boolean {
  if (pm.type !== "card" || !pm.card) return true;
  const now = new Date();
  const { exp_year, exp_month } = pm.card;
  return exp_year > now.getFullYear() || (exp_year === now.getFullYear() && exp_month >= now.getMonth() + 1);
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!stripe) throw new Error("STRIPE_SECRET_KEY is not set.");
  const client = stripe;

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
      stripeSubscriptionId: true,
    },
  });

  let changed = 0;
  let failed = 0;
  const leftAlone: string[] = [];
  for (const org of orgs) {
    try {
      const sub = await client.subscriptions.retrieve(org.stripeSubscriptionId!, {
        expand: ["customer.invoice_settings.default_payment_method", "default_payment_method"],
      });
      if (sub.status !== "trialing" && sub.status !== "paused") {
        leftAlone.push(`${org.id} (${org.name}): ${sub.status}`);
        continue;
      }

      const customer = typeof sub.customer === "string" ? null : (sub.customer as Stripe.Customer);
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const defaults = [sub.default_payment_method, customer?.invoice_settings?.default_payment_method];
      const hasCard =
        defaults.some((pm) => pm && typeof pm === "object" && usable(pm)) ||
        (await client.customers.listPaymentMethods(customerId, { type: "card", limit: 100 })).data.some(usable);

      const data: {
        subscriptionStatus?: string;
        trialEndsAt?: Date;
        cardAdded?: boolean;
        plan?: "TRIAL";
        paidPlanStartedAt?: null;
      } = {};
      if (org.cardAdded !== hasCard) data.cardAdded = hasCard;
      if (sub.status === "trialing") {
        if (org.subscriptionStatus !== sub.status) data.subscriptionStatus = sub.status;
        if (sub.trial_end) {
          const trialEnd = new Date(sub.trial_end * 1000);
          if (org.trialEndsAt?.getTime() !== trialEnd.getTime()) data.trialEndsAt = trialEnd;
        }
        if (PAID_PLANS.has(org.plan)) data.plan = "TRIAL";
        if (org.paidPlanStartedAt) {
          const paid = await client.invoices.list({ customer: customerId, status: "paid", limit: 100 });
          if (!paid.data.some((i) => (i.amount_paid ?? 0) > 0)) data.paidPlanStartedAt = null;
        }
      }

      if (Object.keys(data).length === 0) continue;
      changed += 1;
      const before = {
        stripe: sub.status,
        plan: org.plan,
        subscriptionStatus: org.subscriptionStatus,
        cardAdded: org.cardAdded,
        trialEndsAt: org.trialEndsAt?.toISOString().slice(0, 10) ?? null,
        paidPlanStartedAt: org.paidPlanStartedAt ? "set" : null,
      };
      console.log(`${org.id} (${org.name})`, JSON.stringify(before), "→", JSON.stringify(data));
      if (apply) await prisma.organization.update({ where: { id: org.id }, data });
    } catch (err) {
      failed += 1;
      console.warn(`skipped ${org.id} (${org.name}): ${(err as Error).message}`);
    }
  }

  if (leftAlone.length > 0) {
    console.log(`Left alone (not trialing or paused in Stripe):\n  ${leftAlone.join("\n  ")}`);
  }
  console.log(
    `${orgs.length} teams with a subscription checked: ${changed} ${apply ? "updated" : "would change"}, ` +
      `${leftAlone.length} left alone, ${failed} couldn't be read.`
  );
  if (!apply && changed > 0) console.log("Run again with --apply to write these changes.");
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

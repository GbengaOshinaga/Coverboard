import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { STRIPE_PRICE_IDS } from "@/config/stripePrices";
import { DELETION_GRACE_DAYS } from "@/lib/deletionScheduler";
import {
  dispatchStripeEvent,
  type OrgRecord,
  type OrgUpdate,
  type WebhookDeps,
} from "./stripe-webhook-handlers";

type EmailCall = { name: string; args: unknown };

function makeDeps(
  initial: OrgRecord | null,
  options: { scheduledDeletionExists?: boolean } = {}
) {
  const updates: OrgUpdate[] = [];
  const emails: EmailCall[] = [];
  const calls: { name: string; args: unknown }[] = [];

  const spy = (name: string) => async (args: unknown) => {
    emails.push({ name, args });
  };

  const deps: WebhookDeps = {
    async findOrgByCustomerId() {
      return initial ? { ...initial } : null;
    },
    async updateOrganization(_id, data) {
      updates.push(data);
    },
    async scheduleDeletion(args) {
      calls.push({ name: "scheduleDeletion", args });
      return { scheduledFor: new Date("2026-06-10T00:00:00Z") };
    },
    async cancelScheduledDeletion(args) {
      calls.push({ name: "cancelScheduledDeletion", args });
      return { wasScheduled: options.scheduledDeletionExists ?? false };
    },
    async setTrialGracePeriod(args) {
      calls.push({ name: "setTrialGracePeriod", args });
      return { graceEndsAt: new Date("2026-06-10T00:00:00Z") };
    },
    emailers: {
      trialEndingSoon: spy("trialEndingSoon"),
      paymentFailed: spy("paymentFailed"),
      subscriptionCanceled: spy("subscriptionCanceled"),
      welcomeActive: spy("welcomeActive"),
      accountPaused: spy("accountPaused"),
      deletionScheduled: spy("deletionScheduled"),
      deletionCanceled: spy("deletionCanceled"),
    },
  };

  return { deps, updates, emails, calls };
}

function makeOrg(overrides: Partial<OrgRecord> = {}): OrgRecord {
  return {
    id: "org_1",
    plan: "TRIAL",
    stripePriceId: null,
    subscriptionStatus: "trialing",
    trialEndsAt: new Date("2026-05-25T00:00:00Z"),
    currentPeriodEnd: null,
    adminEmail: "admin@example.com",
    ...overrides,
  };
}

function subscriptionEvent(
  type: string,
  sub: Partial<Stripe.Subscription> & { customer: string }
): Stripe.Event {
  return {
    id: "evt_test",
    type,
    data: { object: sub as Stripe.Subscription },
  } as unknown as Stripe.Event;
}

function invoiceEvent(
  type: string,
  invoice: Partial<Stripe.Invoice> & { customer: string }
): Stripe.Event {
  return {
    id: "evt_test",
    type,
    data: { object: invoice as Stripe.Invoice },
  } as unknown as Stripe.Event;
}

// ---------- customer.subscription.trial_will_end ----------

test("trial_will_end emails the admin with 3 days left", async () => {
  const { deps, emails } = makeDeps(makeOrg());
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.trial_will_end", {
      customer: "cus_1",
    }),
    deps
  );
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.name, "trialEndingSoon");
  assert.deepEqual(emails[0]!.args, { to: "admin@example.com", daysLeft: 3 });
});

test("trial_will_end is a no-op when org has no admin email", async () => {
  const { deps, emails } = makeDeps(makeOrg({ adminEmail: null }));
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.trial_will_end", {
      customer: "cus_1",
    }),
    deps
  );
  assert.equal(emails.length, 0);
});

// ---------- customer.subscription.updated ----------

test("subscription.updated active+paid → promotes Prisma plan + writes price & period", async () => {
  const { deps, updates, emails } = makeDeps(makeOrg({ plan: "TRIAL" }));
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.updated", {
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      trial_end: null,
      items: {
        data: [
          {
            price: { id: STRIPE_PRICE_IDS.scale },
            current_period_end: 1_750_000_000,
          },
        ],
      },
    } as unknown as Partial<Stripe.Subscription> & { customer: string }),
    deps
  );

  assert.equal(updates.length, 1);
  const u = updates[0]!;
  assert.equal(u.subscriptionStatus, "active");
  assert.equal(u.stripePriceId, STRIPE_PRICE_IDS.scale);
  assert.equal(u.plan, "SCALE");
  assert.equal(u.cancelAtPeriodEnd, false);
  assert.equal(u.currentPeriodEnd!.getTime(), 1_750_000_000 * 1000);
  assert.equal(emails.length, 0);
});

test("subscription.updated trialing → keeps existing plan, does not promote to paid tier", async () => {
  const { deps, updates } = makeDeps(makeOrg({ plan: "TRIAL" }));
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.updated", {
      customer: "cus_1",
      status: "trialing",
      cancel_at_period_end: false,
      trial_end: 1_750_000_000,
      items: {
        data: [
          {
            price: { id: STRIPE_PRICE_IDS.pro },
            current_period_end: 1_750_500_000,
          },
        ],
      },
    } as unknown as Partial<Stripe.Subscription> & { customer: string }),
    deps
  );
  const u = updates[0]!;
  assert.equal(u.plan, "TRIAL", "plan must remain TRIAL while still trialing");
  assert.equal(u.stripePriceId, STRIPE_PRICE_IDS.pro);
});

test("subscription.updated reads top-level current_period_end when item field is missing", async () => {
  const { deps, updates } = makeDeps(makeOrg());
  const sub = {
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    current_period_end: 1_700_000_000,
    items: {
      data: [
        {
          price: { id: STRIPE_PRICE_IDS.growth },
        },
      ],
    },
  } as unknown as Partial<Stripe.Subscription> & { customer: string };
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.updated", sub),
    deps
  );
  assert.equal(updates[0]!.currentPeriodEnd!.getTime(), 1_700_000_000 * 1000);
});

test("subscription.updated past_due → sets status & sends payment_failed email", async () => {
  const { deps, updates, emails } = makeDeps(makeOrg({ plan: "GROWTH" }));
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.updated", {
      customer: "cus_1",
      status: "past_due",
      cancel_at_period_end: false,
      trial_end: null,
      items: {
        data: [{ price: { id: STRIPE_PRICE_IDS.growth } }],
      },
    } as unknown as Partial<Stripe.Subscription> & { customer: string }),
    deps
  );
  assert.equal(updates[0]!.subscriptionStatus, "past_due");
  assert.equal(updates[0]!.plan, "GROWTH", "non-active status must not change plan");
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.name, "paymentFailed");
});

test("subscription.updated for unknown customer is a no-op", async () => {
  const { deps, updates, emails } = makeDeps(null);
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.updated", {
      customer: "cus_missing",
      status: "active",
      items: { data: [] },
    } as unknown as Partial<Stripe.Subscription> & { customer: string }),
    deps
  );
  assert.equal(updates.length, 0);
  assert.equal(emails.length, 0);
});

// ---------- customer.subscription.deleted ----------

test("subscription.deleted → locks plan, schedules deletion, sends both emails", async () => {
  const { deps, updates, emails, calls } = makeDeps(
    makeOrg({ plan: "GROWTH" })
  );
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.deleted", {
      customer: "cus_1",
    }),
    deps
  );
  assert.equal(updates[0]!.plan, "LOCKED");
  assert.equal(updates[0]!.subscriptionStatus, "canceled");
  assert.equal(updates[0]!.cancelAtPeriodEnd, false);
  assert.equal(
    calls.filter((c) => c.name === "scheduleDeletion").length,
    1
  );
  const emailNames = emails.map((e) => e.name).sort();
  assert.deepEqual(emailNames, ["deletionScheduled", "subscriptionCanceled"]);
});

// ---------- customer.subscription.paused ----------

test("subscription.paused → status=paused, plan=LOCKED, grace period set, account_paused email", async () => {
  const { deps, updates, emails, calls } = makeDeps(makeOrg({ plan: "PRO" }));
  await dispatchStripeEvent(
    subscriptionEvent("customer.subscription.paused", {
      customer: "cus_1",
    }),
    deps
  );
  assert.equal(updates[0]!.subscriptionStatus, "paused");
  assert.equal(updates[0]!.plan, "LOCKED");
  assert.equal(
    calls.filter((c) => c.name === "setTrialGracePeriod").length,
    1
  );
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.name, "accountPaused");
  assert.deepEqual(emails[0]!.args, {
    to: "admin@example.com",
    daysUntilDeletion: DELETION_GRACE_DAYS,
  });
});

// ---------- invoice.payment_succeeded ----------

test("invoice.payment_succeeded from trialing → active, cardAdded, plan from price, welcome email", async () => {
  const { deps, updates, emails, calls } = makeDeps(
    makeOrg({ plan: "TRIAL", subscriptionStatus: "trialing" })
  );
  await dispatchStripeEvent(
    invoiceEvent("invoice.payment_succeeded", {
      customer: "cus_1",
      lines: {
        data: [
          {
            pricing: {
              price_details: { price: STRIPE_PRICE_IDS.growth },
            },
          },
        ],
      },
    } as unknown as Partial<Stripe.Invoice> & { customer: string }),
    deps
  );
  const u = updates[0]!;
  assert.equal(u.subscriptionStatus, "active");
  assert.equal(u.cardAdded, true);
  assert.equal(u.plan, "GROWTH");
  assert.equal(u.trialExpiredGraceEndsAt, null);
  assert.equal(
    calls.filter((c) => c.name === "cancelScheduledDeletion").length,
    1
  );
  assert.equal(emails.length, 1, "trial → active sends exactly one email");
  assert.equal(emails[0]!.name, "welcomeActive");
});

test("invoice.payment_succeeded from already-active → no welcome email", async () => {
  const { deps, emails } = makeDeps(
    makeOrg({
      plan: "GROWTH",
      subscriptionStatus: "active",
      stripePriceId: STRIPE_PRICE_IDS.growth,
    })
  );
  await dispatchStripeEvent(
    invoiceEvent("invoice.payment_succeeded", {
      customer: "cus_1",
      lines: {
        data: [
          {
            pricing: {
              price_details: { price: STRIPE_PRICE_IDS.growth },
            },
          },
        ],
      },
    } as unknown as Partial<Stripe.Invoice> & { customer: string }),
    deps
  );
  assert.equal(emails.length, 0);
});

test("invoice.payment_succeeded also fires deletionCanceled when a deletion was scheduled", async () => {
  const { deps, emails } = makeDeps(
    makeOrg({ plan: "TRIAL", subscriptionStatus: "trialing" }),
    { scheduledDeletionExists: true }
  );
  await dispatchStripeEvent(
    invoiceEvent("invoice.payment_succeeded", {
      customer: "cus_1",
      lines: {
        data: [
          {
            pricing: { price_details: { price: STRIPE_PRICE_IDS.starter } },
          },
        ],
      },
    } as unknown as Partial<Stripe.Invoice> & { customer: string }),
    deps
  );
  const names = emails.map((e) => e.name).sort();
  assert.deepEqual(names, ["deletionCanceled", "welcomeActive"]);
});

test("invoice.payment_succeeded with object-form customer is handled", async () => {
  const { deps, updates } = makeDeps(makeOrg());
  await dispatchStripeEvent(
    {
      id: "evt_test",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: { id: "cus_1" },
          lines: {
            data: [
              {
                pricing: { price_details: { price: STRIPE_PRICE_IDS.scale } },
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event,
    deps
  );
  assert.equal(updates.length, 1);
});

// ---------- invoice.payment_failed ----------

test("invoice.payment_failed → status=past_due + payment_failed email", async () => {
  const { deps, updates, emails } = makeDeps(makeOrg({ plan: "GROWTH" }));
  await dispatchStripeEvent(
    invoiceEvent("invoice.payment_failed", {
      customer: "cus_1",
    }),
    deps
  );
  assert.equal(updates[0]!.subscriptionStatus, "past_due");
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.name, "paymentFailed");
});

// ---------- dispatcher ----------

test("dispatcher ignores unknown event types without throwing", async () => {
  const { deps, updates, emails } = makeDeps(makeOrg());
  await dispatchStripeEvent(
    {
      id: "evt_test",
      type: "customer.created",
      data: { object: { id: "cus_1" } },
    } as unknown as Stripe.Event,
    deps
  );
  assert.equal(updates.length, 0);
  assert.equal(emails.length, 0);
});

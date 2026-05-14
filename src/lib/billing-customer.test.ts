import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { ensureStripeCustomer } from "./billing-customer";

/**
 * Structural stub of just the bit of the Stripe SDK we touch. Lets us
 * exercise the short-circuit + idempotency-key behaviour without importing
 * the real Stripe client (which would need an API key).
 *
 * The full DB-persist path is exercised via real integration smoke tests
 * (see docs/launch-smoke-test.md); this suite covers only the in-memory
 * decisions the helper makes before/after the Stripe call.
 */
type CreateCall = {
  params: Record<string, unknown>;
  options: Record<string, unknown> | undefined;
};

function makeStripeStub(returnId = "cus_stub") {
  const calls: CreateCall[] = [];
  const client = {
    customers: {
      create: async (
        params: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => {
        calls.push({ params, options });
        return { id: returnId };
      },
    },
  } as unknown as Stripe;
  return { client, calls };
}

test("short-circuits without calling Stripe when stripeCustomerId is already set", async () => {
  const { client, calls } = makeStripeStub();
  const out = await ensureStripeCustomer({
    stripeClient: client,
    organizationId: "org_1",
    organizationName: "Acme",
    stripeCustomerId: "cus_already_exists",
  });
  assert.equal(out, "cus_already_exists");
  assert.equal(
    calls.length,
    0,
    "must not call Stripe when the org already has a customer id"
  );
});

test("uses an organization-scoped idempotency key so network retries dedupe", async () => {
  // We can't reach the DB write in this stub-only test, so we expect the
  // helper to throw at the prisma boundary — but the Stripe call has
  // already been made by then, and that's the contract we care about.
  const { client, calls } = makeStripeStub("cus_new");
  await ensureStripeCustomer({
    stripeClient: client,
    organizationId: "org_42",
    organizationName: "Acme",
    stripeCustomerId: null,
  }).catch(() => {
    /* Prisma will fail in this test env; the assertions below cover what
       happened in Stripe before we ever reached Prisma. */
  });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]!.options?.idempotencyKey,
    "coverboard:organization:org_42:stripe-customer"
  );
});

test("includes email and merges extra metadata when signup passes them", async () => {
  const { client, calls } = makeStripeStub();
  await ensureStripeCustomer({
    stripeClient: client,
    organizationId: "org_1",
    organizationName: "Acme",
    stripeCustomerId: null,
    email: "admin@example.com",
    provisioningPath: "signup",
    metadata: { admin_user_id: "user_99" },
  }).catch(() => {});
  const params = calls[0]!.params;
  assert.equal(params.email, "admin@example.com");
  assert.equal(params.name, "Acme");
  const metadata = params.metadata as Record<string, string>;
  assert.equal(metadata.organization_id, "org_1");
  assert.equal(metadata.admin_user_id, "user_99");
  assert.equal(metadata.provisioning_path, "signup");
});

test("omits email key entirely when not supplied (recovery flows)", async () => {
  const { client, calls } = makeStripeStub();
  await ensureStripeCustomer({
    stripeClient: client,
    organizationId: "org_1",
    organizationName: "Acme",
    stripeCustomerId: null,
  }).catch(() => {});
  assert.equal("email" in calls[0]!.params, false);
  const metadata = calls[0]!.params.metadata as Record<string, string>;
  assert.equal(metadata.provisioning_path, "billing_recovery");
});

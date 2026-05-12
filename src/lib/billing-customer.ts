import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

type EnsureStripeCustomerInput = {
  stripeClient: Stripe;
  organizationId: string;
  organizationName: string;
  stripeCustomerId: string | null;
  /** Admin email to attach to the Stripe customer (set at signup; optional during recovery). */
  email?: string | null;
  /** Free-form label persisted to `metadata.provisioning_path` for ops triage. */
  provisioningPath?: string;
  /** Extra metadata merged onto the customer. */
  metadata?: Record<string, string>;
};

/**
 * Idempotent Stripe customer provisioning.
 *
 * Critical invariant: the persisted `Organization.stripeCustomerId` is written
 * immediately after the Stripe call returns successfully, before any other
 * downstream Stripe call (subscription, payment method, etc.) runs. If a later
 * step throws, the customer id is already saved — so retries and recovery
 * flows do not create duplicate customers in Stripe.
 *
 * Stripe-side dedupe is also enforced via an organization-scoped idempotency
 * key, so even a network-layer retry of this exact call produces the same
 * customer rather than a new one.
 */
export async function ensureStripeCustomer({
  stripeClient,
  organizationId,
  organizationName,
  stripeCustomerId,
  email,
  provisioningPath = "billing_recovery",
  metadata = {},
}: EnsureStripeCustomerInput): Promise<string> {
  if (stripeCustomerId) return stripeCustomerId;

  const customer = await stripeClient.customers.create(
    {
      name: organizationName,
      ...(email ? { email } : {}),
      metadata: {
        organization_id: organizationId,
        provisioning_path: provisioningPath,
        ...metadata,
      },
    },
    {
      idempotencyKey: `coverboard:organization:${organizationId}:stripe-customer`,
    }
  );

  const updated = await prisma.organization.updateMany({
    where: { id: organizationId, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });

  if (updated.count > 0) return customer.id;

  const latest = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeCustomerId: true },
  });

  return latest?.stripeCustomerId ?? customer.id;
}

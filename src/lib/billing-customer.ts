import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

type EnsureStripeCustomerInput = {
  stripeClient: Stripe;
  organizationId: string;
  organizationName: string;
  stripeCustomerId: string | null;
};

export async function ensureStripeCustomer({
  stripeClient,
  organizationId,
  organizationName,
  stripeCustomerId,
}: EnsureStripeCustomerInput): Promise<string> {
  if (stripeCustomerId) return stripeCustomerId;

  const customer = await stripeClient.customers.create(
    {
      name: organizationName,
      metadata: {
        organization_id: organizationId,
        provisioning_path: "billing_recovery",
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

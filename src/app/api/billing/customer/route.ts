import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { isValidBillingCountry } from "@/config/billing-countries";

const schema = z.object({
  country: z
    .string({ required_error: "Please pick a country" })
    .trim()
    .toUpperCase()
    .length(2, "Please pick a country")
    .refine(isValidBillingCountry, "Pick a supported billing country"),
});

/**
 * PATCH /api/billing/customer — update the org's Stripe customer.
 * Currently scoped to changing the billing country (address.country). Stripe
 * Tax recalculates on the next invoice based on the new country and any
 * attached tax IDs.
 *
 * Admin-only. Org-scoped via session.organizationId.
 */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!stripe)
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid country" },
      { status: 400 }
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: sessionUser.organizationId as string },
    select: { stripeCustomerId: true },
  });
  if (!org?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer for this organisation yet." },
      { status: 400 }
    );
  }

  try {
    await stripe.customers.update(org.stripeCustomerId, {
      address: { country: parsed.data.country },
    });
    return NextResponse.json({ country: parsed.data.country });
  } catch (err) {
    console.error("Update customer country failed:", err);
    return NextResponse.json(
      { error: "Could not update billing country" },
      { status: 400 }
    );
  }
}

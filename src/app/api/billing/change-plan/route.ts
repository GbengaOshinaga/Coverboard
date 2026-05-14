import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  STRIPE_PRICE_IDS,
  PLAN_DISPLAY_NAME,
  PLAN_MONTHLY_PRICE_GBP,
  planKeyFromPriceId,
  type StripePlanKey,
} from "@/config/stripePrices";

const schema = z.object({
  planKey: z.enum(["starter", "growth", "scale", "pro"]),
});

const BLOCKED_STATUSES = new Set(["canceled", "paused", "past_due", "incomplete_expired"]);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  const targetPlanKey: StripePlanKey = parsed.data.planKey;
  const targetPriceId = STRIPE_PRICE_IDS[targetPlanKey];

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      stripeSubscriptionId: true,
      stripePriceId: true,
      subscriptionStatus: true,
      cancelAtPeriodEnd: true,
    },
  });
  if (!org?.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }
  if (org.subscriptionStatus && BLOCKED_STATUSES.has(org.subscriptionStatus)) {
    return NextResponse.json(
      { error: "Subscription is not in a state that can be changed. Resolve billing first." },
      { status: 409 }
    );
  }
  if (org.cancelAtPeriodEnd) {
    return NextResponse.json(
      { error: "Reactivate your subscription before changing plan." },
      { status: 409 }
    );
  }

  const currentPlanKey = org.stripePriceId ? planKeyFromPriceId(org.stripePriceId) : null;
  if (currentPlanKey === targetPlanKey) {
    return NextResponse.json({ error: "You are already on this plan." }, { status: 400 });
  }

  try {
    const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json(
        { error: "Subscription has no line items to update." },
        { status: 500 }
      );
    }

    await stripe.subscriptions.update(org.stripeSubscriptionId, {
      items: [{ id: itemId, price: targetPriceId }],
      proration_behavior: "create_prorations",
      metadata: {
        ...(sub.metadata ?? {}),
        plan_key: targetPlanKey,
      },
    });

    // Optimistic DB write so the billing page reflects the change immediately;
    // the customer.subscription.updated webhook will reconcile authoritative fields.
    await prisma.organization.update({
      where: { id: orgId },
      data: { stripePriceId: targetPriceId },
    });

    return NextResponse.json({
      planKey: targetPlanKey,
      planName: PLAN_DISPLAY_NAME[targetPlanKey],
      priceGbp: PLAN_MONTHLY_PRICE_GBP[targetPlanKey],
    });
  } catch (err) {
    console.error("Change plan failed:", err);
    return NextResponse.json({ error: "Could not change plan" }, { status: 500 });
  }
}

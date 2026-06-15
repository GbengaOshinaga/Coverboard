import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/**
 * Downgrade-to-Free flow.
 *
 * Distinct from "Cancel subscription" (which schedules a 30-day account
 * deletion). Here the customer wants to stop paying but keep using
 * Coverboard on the Free tier. We:
 *
 *   1. Schedule the Stripe subscription to cancel at period end. They keep
 *      paid-tier access for the remainder of the period they already paid
 *      for — they're not punished for what they've already paid.
 *   2. Tag the subscription with `metadata.downgrade_target = "free"` so
 *      the webhook handler knows to flip the org to FREE (not LOCKED) and
 *      skip the deletion-scheduling branch when the period actually ends.
 *
 * Until the webhook fires, the local plan stays unchanged — the customer
 * keeps the features they paid for. The billing page shows the standard
 * "Cancels on X" banner; if they change their mind they can hit
 * `/api/billing/reactivate` to undo, which also clears the metadata flag.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!stripe) {
    return NextResponse.json(
      { error: "Billing not configured" },
      { status: 503 }
    );
  }

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      plan: true,
      stripeSubscriptionId: true,
      cancelAtPeriodEnd: true,
    },
  });

  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 }
    );
  }

  if (org.plan === "FREE") {
    return NextResponse.json(
      { error: "You're already on the Free tier." },
      { status: 400 }
    );
  }
  if (!org.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription to downgrade." },
      { status: 400 }
    );
  }

  try {
    const existing = await stripe.subscriptions.retrieve(
      org.stripeSubscriptionId
    );
    const mergedMetadata = {
      ...(existing.metadata ?? {}),
      downgrade_target: "free",
    };

    const sub = await stripe.subscriptions.update(org.stripeSubscriptionId, {
      cancel_at_period_end: true,
      metadata: mergedMetadata,
    });

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        cancelAtPeriodEnd: true,
        subscriptionStatus: "canceling",
      },
    });

    return NextResponse.json({
      success: true,
      cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
    });
  } catch (err) {
    console.error("Downgrade to free failed:", err);
    return NextResponse.json(
      { error: "Could not switch to the Free tier. Please try again." },
      { status: 500 }
    );
  }
}

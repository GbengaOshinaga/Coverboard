import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { cancelScheduledDeletion } from "@/lib/deletionScheduler";
import { emailDeletionCanceled } from "@/lib/billing-emails";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!stripe) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { stripeSubscriptionId: true },
  });
  if (!org?.stripeSubscriptionId) {
    return NextResponse.json({ error: "No subscription to reactivate" }, { status: 400 });
  }

  try {
    // If the customer previously chose "Switch to Free" we tagged the
    // subscription with `metadata.downgrade_target = "free"`. Reactivating
    // means they changed their mind — clear that flag so a future plain
    // cancellation doesn't accidentally take the downgrade-to-free branch
    // in the webhook handler.
    const existing = await stripe.subscriptions.retrieve(
      org.stripeSubscriptionId
    );
    const metadata = { ...(existing.metadata ?? {}) } as Record<string, string>;
    const hadDowngradeFlag = "downgrade_target" in metadata;
    delete metadata.downgrade_target;

    await stripe.subscriptions.update(org.stripeSubscriptionId, {
      cancel_at_period_end: false,
      ...(hadDowngradeFlag ? { metadata } : {}),
    });
    await prisma.organization.update({
      where: { id: orgId },
      data: { cancelAtPeriodEnd: false, subscriptionStatus: "active" },
    });

    const { wasScheduled } = await cancelScheduledDeletion({
      organizationId: orgId,
      canceledBy: (sessionUser.email as string) ?? "billing.reactivate",
    });
    if (wasScheduled) {
      const adminEmail = sessionUser.email as string | undefined;
      if (adminEmail) {
        await emailDeletionCanceled({ to: adminEmail }).catch((err) =>
          console.error("Deletion-canceled email failed:", err)
        );
      }
    }

    const orgPlan = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });
    trackServer(
      AnalyticsEvents.SUBSCRIPTION_REACTIVATED,
      { deletion_canceled: wasScheduled },
      {
        userId: sessionUser.id as string,
        organizationId: orgId,
        role: "ADMIN",
        plan: orgPlan?.plan,
      }
    );

    return NextResponse.json({ success: true, deletionCanceled: wasScheduled });
  } catch (err) {
    console.error("Reactivate subscription failed:", err);
    return NextResponse.json({ error: "Could not reactivate subscription" }, { status: 500 });
  }
}

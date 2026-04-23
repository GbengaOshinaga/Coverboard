import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

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
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  try {
    const sub = await stripe.subscriptions.update(org.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await prisma.organization.update({
      where: { id: orgId },
      data: { cancelAtPeriodEnd: true },
    });
    return NextResponse.json({
      cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
    });
  } catch (err) {
    console.error("Cancel subscription failed:", err);
    return NextResponse.json({ error: "Could not cancel subscription" }, { status: 500 });
  }
}

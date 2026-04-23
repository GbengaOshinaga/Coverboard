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
    return NextResponse.json({ error: "No subscription to reactivate" }, { status: 400 });
  }

  try {
    await stripe.subscriptions.update(org.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    await prisma.organization.update({
      where: { id: orgId },
      data: { cancelAtPeriodEnd: false },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Reactivate subscription failed:", err);
    return NextResponse.json({ error: "Could not reactivate subscription" }, { status: 500 });
  }
}

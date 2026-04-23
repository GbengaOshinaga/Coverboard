import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

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
      { error: "Billing is not configured" },
      { status: 503 }
    );
  }

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { stripeCustomerId: true },
  });

  if (!org?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer associated with this organization" },
      { status: 400 }
    );
  }

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: org.stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });
    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("Failed to create SetupIntent:", err);
    return NextResponse.json(
      { error: "Could not initialise payment form" },
      { status: 500 }
    );
  }
}

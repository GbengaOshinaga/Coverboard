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
    select: { id: true, name: true, stripeCustomerId: true },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  try {
    let stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: (sessionUser.email as string | undefined) ?? undefined,
        name: org.name,
        metadata: {
          organization_id: org.id,
          admin_user_id: (sessionUser.id as string | undefined) ?? "",
        },
      });
      stripeCustomerId = customer.id;
      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId },
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
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

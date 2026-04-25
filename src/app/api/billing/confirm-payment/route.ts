import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { cancelScheduledDeletion } from "@/lib/deletionScheduler";
import { emailDeletionCanceled } from "@/lib/billing-emails";
import { z } from "zod";

const schema = z.object({
  paymentMethodId: z.string().min(1),
});

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

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const orgId = sessionUser.organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!org?.stripeCustomerId || !org.stripeSubscriptionId) {
    return NextResponse.json({ error: "Missing Stripe IDs" }, { status: 400 });
  }

  try {
    await stripe.paymentMethods.attach(parsed.data.paymentMethodId, {
      customer: org.stripeCustomerId,
    });

    await stripe.customers.update(org.stripeCustomerId, {
      invoice_settings: { default_payment_method: parsed.data.paymentMethodId },
    });

    await stripe.subscriptions.update(org.stripeSubscriptionId, {
      default_payment_method: parsed.data.paymentMethodId,
    });

    await prisma.organization.update({
      where: { id: orgId },
      data: { cardAdded: true, trialExpiredGraceEndsAt: null },
    });

    const { wasScheduled } = await cancelScheduledDeletion({
      organizationId: orgId,
      canceledBy: (sessionUser.email as string) ?? "add-payment",
    });
    if (wasScheduled) {
      const adminEmail = sessionUser.email as string | undefined;
      if (adminEmail) {
        await emailDeletionCanceled({ to: adminEmail }).catch((err) =>
          console.error("Deletion-canceled email failed:", err)
        );
      }
    }

    return NextResponse.json({ success: true, deletionCanceled: wasScheduled });
  } catch (err: unknown) {
    const code = (err as { code?: string; message?: string })?.code;
    const message = (err as { message?: string })?.message ?? "Unknown error";
    console.error("Failed to confirm payment method:", err);
    if (code === "card_declined") {
      return NextResponse.json(
        { error: "Your card was declined. Please try a different card." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: message || "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

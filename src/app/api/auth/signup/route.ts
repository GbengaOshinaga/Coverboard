import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { STRIPE_PRICE_IDS, type StripePlanKey } from "@/config/stripePrices";
import { ensureStripeCustomer } from "@/lib/billing-customer";

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  orgName: z.string().min(2, "Team name must be at least 2 characters"),
  plan: z.enum(["starter", "growth", "scale", "pro"]).default("growth"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, orgName, plan } = parsed.data;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Generate a URL-safe slug from the org name
    const baseSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create org + admin user in a single transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug,
          onboardingCompleted: false,
          plan: "TRIAL",
        },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: "ADMIN",
          organizationId: org.id,
        },
      });

      return { org, user };
    });

    // Create Stripe customer + trialing subscription (no card required).
    // Fail soft: if Stripe isn't configured we still let the user in — they'll
    // be treated as on the TRIAL plan with trialEndsAt set to 14 days out.
    const trialDays = 14;
    const selectedPlan: StripePlanKey = plan;
    let trialEndsAt: Date = new Date(Date.now() + trialDays * 86400_000);
    let stripeCustomerId: string | null = null;
    let stripeSubscriptionId: string | null = null;

    if (stripe) {
      try {
        // Persist the customer id immediately. If a later step throws, recovery
        // flows (setup-intent, confirm-payment) reuse this id rather than
        // creating a duplicate customer in Stripe.
        stripeCustomerId = await ensureStripeCustomer({
          stripeClient: stripe,
          organizationId: result.org.id,
          organizationName: orgName,
          stripeCustomerId: null,
          email,
          provisioningPath: "signup",
          metadata: { admin_user_id: result.user.id },
        });

        const subscription = await stripe.subscriptions.create(
          {
            customer: stripeCustomerId,
            items: [{ price: STRIPE_PRICE_IDS[selectedPlan] }],
            trial_period_days: trialDays,
            payment_settings: {
              save_default_payment_method: "on_subscription",
            },
            trial_settings: {
              end_behavior: {
                missing_payment_method: "pause",
              },
            },
            metadata: {
              organization_id: result.org.id,
              plan_key: selectedPlan,
            },
          },
          {
            idempotencyKey: `coverboard:organization:${result.org.id}:trial-subscription`,
          }
        );
        stripeSubscriptionId = subscription.id;
        if (subscription.trial_end) {
          trialEndsAt = new Date(subscription.trial_end * 1000);
        }

        await prisma.organization.update({
          where: { id: result.org.id },
          data: {
            stripeSubscriptionId,
            stripePriceId: STRIPE_PRICE_IDS[selectedPlan],
            trialEndsAt,
            subscriptionStatus: "trialing",
            cardAdded: false,
          },
        });
      } catch (stripeError) {
        console.error("Stripe provisioning failed at signup:", stripeError);
        // ensureStripeCustomer already persisted stripeCustomerId if it
        // succeeded, so partial failure no longer orphans a Stripe customer.
        await prisma.organization.update({
          where: { id: result.org.id },
          data: { trialEndsAt, subscriptionStatus: "trialing" },
        });
      }
    } else {
      await prisma.organization.update({
        where: { id: result.org.id },
        data: { trialEndsAt, subscriptionStatus: "trialing" },
      });
    }

    return NextResponse.json(
      {
        success: true,
        organizationId: result.org.id,
        userId: result.user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

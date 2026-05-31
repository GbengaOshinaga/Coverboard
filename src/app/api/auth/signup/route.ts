import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { STRIPE_PRICE_IDS, type StripePlanKey } from "@/config/stripePrices";
import { ensureStripeCustomer } from "@/lib/billing-customer";
import { sendSignupWelcomeEmail } from "@/lib/email-notifications";
import { sendVerificationEmail } from "@/lib/email-verification";
import { evaluatePasswordStrength } from "@/lib/password-strength";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { checkAuthRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  DEFAULT_BILLING_COUNTRY,
  isValidBillingCountry,
} from "@/config/billing-countries";

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  orgName: z.string().min(2, "Team name must be at least 2 characters"),
  plan: z.enum(["free", "starter", "growth", "scale", "pro"]).default("growth"),
  billingCountry: z
    .string()
    .trim()
    .toUpperCase()
    .length(2)
    .refine(isValidBillingCountry, "Please pick a supported billing country")
    .default(DEFAULT_BILLING_COUNTRY),
});

export async function POST(request: Request) {
  try {
    const rateLimit = await checkAuthRateLimit(getClientIp(request), "signup");
    if (!rateLimit.ok) return rateLimit.response;

    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, orgName, plan, billingCountry } = parsed.data;

    const strength = evaluatePasswordStrength(password, [email, name, orgName]);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.message }, { status: 400 });
    }

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

    // Free signups land on the FREE tier directly with no trial; paid-plan
    // signups land on TRIAL and get full Pro-bundle features for 14 days.
    const initialPlanEnum: "FREE" | "TRIAL" = plan === "free" ? "FREE" : "TRIAL";

    // Create org + admin user in a single transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug,
          onboardingCompleted: false,
          plan: initialPlanEnum,
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
    //
    // Free plan: no trial, no subscription. We still provision a Stripe
    // customer so that the inevitable upgrade flow can attach a payment
    // method without recreating the customer (and so VAT/tax-id state has
    // somewhere to live if the customer adds one before upgrading).
    const trialDays = 14;
    const isFreePlan = plan === "free";
    const selectedPaidPlan: StripePlanKey | null = isFreePlan
      ? null
      : (plan as StripePlanKey);
    let trialEndsAt: Date | null = isFreePlan
      ? null
      : new Date(Date.now() + trialDays * 86400_000);
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
          country: billingCountry,
          provisioningPath: "signup",
          metadata: {
            admin_user_id: result.user.id,
            signup_plan: plan,
          },
        });

        if (selectedPaidPlan) {
          const subscription = await stripe.subscriptions.create(
            {
              customer: stripeCustomerId,
              items: [{ price: STRIPE_PRICE_IDS[selectedPaidPlan] }],
              trial_period_days: trialDays,
              payment_settings: {
                save_default_payment_method: "on_subscription",
              },
              trial_settings: {
                end_behavior: {
                  missing_payment_method: "pause",
                },
              },
              // Stripe Tax: calculate VAT/GST automatically based on customer
              // address + any tax IDs they later attach. Tax is added on top of
              // our listed prices ("exclusive" behaviour), matching the
              // "£X/month + VAT where applicable" copy on the pricing page.
              automatic_tax: { enabled: true },
              metadata: {
                organization_id: result.org.id,
                plan_key: selectedPaidPlan,
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
              stripePriceId: STRIPE_PRICE_IDS[selectedPaidPlan],
              trialEndsAt,
              subscriptionStatus: "trialing",
              cardAdded: false,
            },
          });
        }
      } catch (stripeError) {
        console.error("Stripe provisioning failed at signup:", stripeError);
        // ensureStripeCustomer already persisted stripeCustomerId if it
        // succeeded, so partial failure no longer orphans a Stripe customer.
        // We still record the trial fields for paid-plan signups so the
        // dashboard's trial banner shows up; the customer can add a card
        // later to repair the missing subscription.
        if (!isFreePlan) {
          await prisma.organization.update({
            where: { id: result.org.id },
            data: { trialEndsAt, subscriptionStatus: "trialing" },
          });
        }
      }
    } else if (!isFreePlan) {
      // No Stripe at all → treat paid-plan signups as if they're in the trial
      // window anyway; Free signups don't need this hydration.
      await prisma.organization.update({
        where: { id: result.org.id },
        data: { trialEndsAt, subscriptionStatus: "trialing" },
      });
    }

    sendSignupWelcomeEmail({
      userName: name,
      orgName,
      email,
      plan,
      trialDays,
    }).catch((err) =>
      console.error("Signup welcome email failed:", err)
    );

    // Fire-and-forget the verification email. Sign-in is not blocked on
    // verification (the dashboard banner prompts the user instead), so a
    // transient Resend outage shouldn't fail signup.
    sendVerificationEmail({
      userId: result.user.id,
      userName: name,
      email,
    }).catch((err) =>
      console.error("Signup verification email failed:", err)
    );

    trackServer(
      AnalyticsEvents.SIGNUP_COMPLETED,
      {
        selected_plan: plan,
        stripe_provisioned: Boolean(stripeSubscriptionId),
        is_free_signup: isFreePlan,
      },
      {
        userId: result.user.id,
        organizationId: result.org.id,
        role: "ADMIN",
        plan: initialPlanEnum,
      }
    );

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

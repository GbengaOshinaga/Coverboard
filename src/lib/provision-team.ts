import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { STRIPE_PRICE_IDS, type StripePlanKey } from "@/config/stripePrices";
import { ensureStripeCustomer } from "@/lib/billing-customer";
import { DEFAULT_BILLING_COUNTRY } from "@/config/billing-countries";

export type SignupPlanKey = "free" | "starter" | "growth" | "scale" | "pro";

export interface ProvisionTeamParams {
  name: string;
  email: string;
  /** A bcrypt hash. For OAuth signups pass a random, unusable hash. */
  passwordHash: string;
  orgName: string;
  plan: SignupPlanKey;
  billingCountry?: string;
  /** OAuth signups arrive with a provider-verified email — pass true to skip the verification step. */
  emailVerified?: boolean;
  /** Recorded in Stripe metadata to distinguish signup sources (e.g. "signup" vs "google"). */
  provisioningPath?: string;
}

export interface ProvisionTeamResult {
  orgId: string;
  userId: string;
  stripeSubscriptionId: string | null;
  trialEndsAt: Date | null;
  initialPlanEnum: "FREE" | "TRIAL";
}

const TRIAL_DAYS = 14;

/**
 * Creates an organisation + its admin user and provisions the Stripe customer
 * (and trialing subscription for paid plans). Shared by the credentials signup
 * route and the Google sign-up completion route so both paths stay identical.
 *
 * Stripe is fail-soft: if it's unconfigured or errors, paid-plan orgs still get
 * their trial fields set so the dashboard trial banner works and the customer
 * can repair billing by adding a card later.
 */
export async function provisionTeam(
  params: ProvisionTeamParams
): Promise<ProvisionTeamResult> {
  const {
    name,
    email,
    passwordHash,
    orgName,
    plan,
    billingCountry = DEFAULT_BILLING_COUNTRY,
    emailVerified = false,
    provisioningPath = "signup",
  } = params;

  // Generate a unique URL-safe slug from the org name.
  const baseSlug =
    orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "team";
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  // Free signups land on FREE directly (no trial); paid-plan signups land on
  // TRIAL and get the full Pro bundle for 14 days.
  const initialPlanEnum: "FREE" | "TRIAL" = plan === "free" ? "FREE" : "TRIAL";

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
        ...(emailVerified ? { emailVerified: new Date() } : {}),
      },
    });

    return { org, user };
  });

  const isFreePlan = plan === "free";
  const selectedPaidPlan: StripePlanKey | null = isFreePlan
    ? null
    : (plan as StripePlanKey);
  let trialEndsAt: Date | null = isFreePlan
    ? null
    : new Date(Date.now() + TRIAL_DAYS * 86400_000);
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;

  if (stripe) {
    try {
      // Persist the customer id immediately so recovery flows reuse it rather
      // than creating a duplicate customer in Stripe.
      stripeCustomerId = await ensureStripeCustomer({
        stripeClient: stripe,
        organizationId: result.org.id,
        organizationName: orgName,
        stripeCustomerId: null,
        email,
        country: billingCountry,
        provisioningPath,
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
            trial_period_days: TRIAL_DAYS,
            payment_settings: {
              save_default_payment_method: "on_subscription",
            },
            trial_settings: {
              end_behavior: { missing_payment_method: "pause" },
            },
            // Stripe Tax adds VAT/GST on top of listed prices ("exclusive").
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
      if (!isFreePlan) {
        await prisma.organization.update({
          where: { id: result.org.id },
          data: { trialEndsAt, subscriptionStatus: "trialing" },
        });
      }
    }
  } else if (!isFreePlan) {
    await prisma.organization.update({
      where: { id: result.org.id },
      data: { trialEndsAt, subscriptionStatus: "trialing" },
    });
  }

  return {
    orgId: result.org.id,
    userId: result.user.id,
    stripeSubscriptionId,
    trialEndsAt,
    initialPlanEnum,
  };
}

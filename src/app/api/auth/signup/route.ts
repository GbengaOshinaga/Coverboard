import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { provisionTeam } from "@/lib/provision-team";
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

    const passwordHash = await bcrypt.hash(password, 10);

    const { orgId, userId, stripeSubscriptionId, initialPlanEnum } =
      await provisionTeam({
        name,
        email,
        passwordHash,
        orgName,
        plan,
        billingCountry,
        provisioningPath: "signup",
      });

    const trialDays = 14;
    const isFreePlan = plan === "free";

    sendSignupWelcomeEmail({
      userName: name,
      orgName,
      email,
      plan,
      trialDays,
    }).catch((err) => console.error("Signup welcome email failed:", err));

    // Fire-and-forget the verification email. Sign-in is not blocked on
    // verification (the dashboard banner prompts the user instead), so a
    // transient Resend outage shouldn't fail signup.
    sendVerificationEmail({
      userId,
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
        userId,
        organizationId: orgId,
        role: "ADMIN",
        plan: initialPlanEnum,
      }
    );

    return NextResponse.json(
      {
        success: true,
        organizationId: orgId,
        userId,
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

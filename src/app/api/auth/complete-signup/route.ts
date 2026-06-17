import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { provisionTeam } from "@/lib/provision-team";
import { sendSignupWelcomeEmail } from "@/lib/email-notifications";
import { maybeSendFounderEmail } from "@/lib/founder-outreach";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { checkAuthRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Completes Google sign-up: the user has authenticated via OAuth but has no
 * organisation yet. This creates their team + admin account (mirroring the
 * credentials signup), marking the email verified since Google vouches for it.
 */
const completeSignupSchema = z.object({
  orgName: z.string().min(2, "Team name must be at least 2 characters"),
  plan: z.enum(["free", "starter", "growth", "scale", "pro"]).default("growth"),
});

export async function POST(request: Request) {
  try {
    const rateLimit = await checkAuthRateLimit(getClientIp(request), "signup");
    if (!rateLimit.ok) return rateLimit.response;

    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    const name = session?.user?.name;
    if (!email || !name) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const parsed = completeSignupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { orgName, plan } = parsed.data;

    // Idempotency: if this account already exists (double-submit, or the user
    // somehow already has a team), return it rather than creating a duplicate.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { organizationId: true },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        organizationId: existing.organizationId,
      });
    }

    // OAuth users have no password. Store a random, unusable hash so the
    // non-null column is satisfied; they can set a real one via password reset.
    const passwordHash = await bcrypt.hash(
      crypto.randomBytes(32).toString("hex"),
      10
    );

    const { orgId, userId, stripeSubscriptionId, initialPlanEnum } =
      await provisionTeam({
        name,
        email,
        passwordHash,
        orgName,
        plan,
        emailVerified: true,
        provisioningPath: "google",
      });

    sendSignupWelcomeEmail({
      userName: name,
      orgName,
      email,
      plan,
      trialDays: 14,
    }).catch((err) => console.error("Google signup welcome email failed:", err));

    // Founder outreach is normally triggered on email verification; Google
    // signups skip that step, so fire the gated check directly here.
    maybeSendFounderEmail(userId).catch((err) =>
      console.error("Founder outreach (google signup) failed:", err)
    );

    trackServer(
      AnalyticsEvents.SIGNUP_COMPLETED,
      {
        selected_plan: plan,
        stripe_provisioned: Boolean(stripeSubscriptionId),
        is_free_signup: plan === "free",
        signup_method: "google",
      },
      {
        userId,
        organizationId: orgId,
        role: "ADMIN",
        plan: initialPlanEnum,
      }
    );

    return NextResponse.json({ success: true, organizationId: orgId });
  } catch (error) {
    console.error("Complete-signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

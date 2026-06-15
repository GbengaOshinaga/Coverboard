import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeVerificationToken } from "@/lib/email-verification";
import { checkAuthRateLimit, getClientIp } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(1),
});

/**
 * Consume a verification token. Public route (the recipient might not be
 * signed in when they click the email). Rate-limited by IP under the
 * password-reset bucket so a brute-force guesser can't churn through tokens.
 */
export async function POST(request: Request) {
  const rateLimit = await checkAuthRateLimit(
    getClientIp(request),
    "passwordReset"
  );
  if (!rateLimit.ok) return rateLimit.response;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Verification link is missing or malformed." },
      { status: 400 }
    );
  }

  const result = await consumeVerificationToken(parsed.data.token);
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "This verification link has expired. Please request a new one."
        : result.reason === "used"
        ? "This verification link has already been used."
        : "This verification link is invalid.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    alreadyVerified: result.alreadyVerified,
  });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email-verification";
import { checkAuthRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Resend the verification email for the currently signed-in user. Sign-in
 * is allowed before verification — the banner in the dashboard layout
 * surfaces this endpoint when the user hasn't verified yet.
 *
 * Rate-limited by IP so a hijacked session can't be used to spam a victim's
 * inbox. The endpoint is intentionally a no-op when the user is already
 * verified — clicking "Resend" after the link has already been used should
 * not send another email.
 */
export async function POST(request: Request) {
  const rateLimit = await checkAuthRateLimit(
    getClientIp(request),
    "emailVerificationResend"
  );
  if (!rateLimit.ok) return rateLimit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userId = sessionUser.id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerified: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Idempotent no-op: don't waste an email if the user is already verified.
  if (user.emailVerified) {
    return NextResponse.json({ success: true, alreadyVerified: true });
  }

  try {
    await sendVerificationEmail({
      userId: user.id,
      userName: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error("Resend verification email failed:", err);
    return NextResponse.json(
      { error: "Could not send verification email. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

/**
 * Email-verification helpers.
 *
 * Goal: prove that whoever signed up actually controls the email address on
 * the account. Without this, anyone can sign up with anyone else's work
 * email — a real impersonation vector for a tool that handles sickness
 * notifications.
 *
 * Design mirrors `PasswordResetToken`:
 *   - 32-byte random hex token
 *   - 24 hour expiry (long enough that someone can verify after a meeting,
 *     short enough that an old link can't be reused indefinitely)
 *   - Single-use (`usedAt` flag)
 *   - Existing unused tokens are invalidated when a new one is issued, so a
 *     user can resend without leaving the old link valid
 *
 * Only the token's hash is stored, as for password-reset and invite links
 * (src/lib/auth-tokens.ts); the email carries the token itself.
 */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { emailVerificationEmail } from "@/lib/email-templates";
import { getAppBaseUrl } from "@/lib/app-url";
import { maybeSendFounderEmail } from "@/lib/founder-outreach";
import { NextResponse } from "next/server";
import { hashToken, newLinkToken } from "@/lib/auth-tokens";

/**
 * Inviting people needs a verified email. Signing in doesn't (a trial starts
 * straight away), but without this anyone could sign up as someone else's
 * work address and send invites from Coverboard to real staff in that
 * person's name. Every invite route checks it: adding someone, bulk import,
 * resending an invite and onboarding.
 */
export const VERIFY_BEFORE_INVITING =
  "Verify your email address before inviting people. Use the link we sent you, or send a new one from the banner at the top of the page.";

export async function hasVerifiedEmail(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  return Boolean(user?.emailVerified);
}

/** The 403 an invite route sends when the inviter's email isn't verified, or null. */
export async function inviteVerificationGate(userId: string): Promise<NextResponse | null> {
  if (await hasVerifiedEmail(userId)) return null;
  return NextResponse.json({ error: VERIFY_BEFORE_INVITING }, { status: 403 });
}

export const EMAIL_VERIFICATION_EXPIRES_HOURS = 24;

export type ConsumeResult =
  | { ok: true; userId: string; alreadyVerified: boolean }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Create a fresh verification token for `userId`, invalidating any unused
 * tokens that user might already have. Returns the plaintext token; the
 * caller is responsible for embedding it in an email.
 */
export async function createVerificationToken(userId: string): Promise<string> {
  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { token, tokenHash } = newLinkToken();
  const expiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000
  );

  await prisma.emailVerificationToken.create({
    data: { token: tokenHash, userId, expiresAt },
  });

  return token;
}

/**
 * Issue a token and send the verification email. Fire-and-forget at the
 * call-site (we catch failures so signup doesn't fail because Resend is
 * down).
 */
export async function sendVerificationEmail(params: {
  userId: string;
  userName: string;
  email: string;
}): Promise<void> {
  const token = await createVerificationToken(params.userId);
  const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(
    token
  )}`;
  const { subject, html } = emailVerificationEmail({
    userName: params.userName,
    verifyUrl,
    expiresInHours: EMAIL_VERIFICATION_EXPIRES_HOURS,
  });
  await sendEmail({ to: params.email, subject, html });
}

/**
 * Consume a verification token. Idempotent: if the underlying user is
 * already verified we return `ok: true, alreadyVerified: true` regardless of
 * the token's own state — a user who refreshes the verify page shouldn't
 * see an error.
 */
export async function consumeVerificationToken(
  rawToken: string
): Promise<ConsumeResult> {
  if (!rawToken) return { ok: false, reason: "invalid" };

  const tokenRow = await prisma.emailVerificationToken.findUnique({
    where: { token: hashToken(rawToken) },
    include: { user: { select: { id: true, emailVerified: true } } },
  });

  if (!tokenRow) return { ok: false, reason: "invalid" };

  if (tokenRow.user.emailVerified) {
    // The token might be expired or already used, but the underlying user
    // is already verified — treat the click as a no-op success.
    return {
      ok: true,
      userId: tokenRow.userId,
      alreadyVerified: true,
    };
  }

  if (tokenRow.usedAt) return { ok: false, reason: "used" };
  if (tokenRow.expiresAt < new Date()) return { ok: false, reason: "expired" };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: tokenRow.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: tokenRow.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // Fire-and-forget: send the founder outreach email if this is the first
  // admin of a new org and we're still under the configured cap. The
  // helper is internally guarded against ineligible cases.
  void maybeSendFounderEmail(tokenRow.userId);

  return { ok: true, userId: tokenRow.userId, alreadyVerified: false };
}

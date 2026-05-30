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
 * Tokens are stored plaintext, matching the existing `PasswordResetToken`
 * convention. Hashing them at rest is a hardening project that should cover
 * both token tables together; not in scope here.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { emailVerificationEmail } from "@/lib/email-templates";
import { getAppBaseUrl } from "@/lib/app-url";

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

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000
  );

  await prisma.emailVerificationToken.create({
    data: { token, userId, expiresAt },
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
    where: { token: rawToken },
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

  return { ok: true, userId: tokenRow.userId, alreadyVerified: false };
}

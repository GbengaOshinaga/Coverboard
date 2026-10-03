import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/app-url";

/**
 * Invites email a one-time "set your password" link instead of a password.
 * Links reuse the password-reset tokens (single use, replaced by any newer
 * link or reset request) but last longer, since an invite may sit in an inbox
 * for a few days.
 */
export const INVITE_LINK_DAYS = 7;

/** A password nobody knows, for accounts that haven't set their own yet. */
export function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
}

export async function createSetPasswordLink(userId: string): Promise<string> {
  // Only the newest link works.
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + INVITE_LINK_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return `${getAppBaseUrl()}/reset-password?token=${token}&invite=1`;
}

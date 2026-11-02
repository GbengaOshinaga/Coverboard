import crypto from "crypto";

/**
 * One-time links (password reset, invite and email verification) carry a
 * random token; the database keeps only its SHA-256 hash. A copy of the
 * database (a backup, say) then can't be used to open anyone's link. The
 * tokens are 32 random bytes, so a plain hash is enough; no salt or slow
 * hash is needed.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** A new token for a link, and the hash to store in its place. */
export function newLinkToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

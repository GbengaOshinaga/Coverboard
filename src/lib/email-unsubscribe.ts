/**
 * Email unsubscribe token helpers.
 *
 * We mint a signed token per recipient when sending unsubscribe-eligible
 * emails (currently the weekly digest). The token encodes the user id, an
 * expiry, and the email "kind" so a token issued for the weekly digest
 * can't be replayed against a future "marketing" email type.
 *
 * Pure functions — no DB, no env-time globals. The signing secret is
 * passed in by the caller so tests can use a fixed key. The route layer
 * reads `NEXTAUTH_SECRET` from the environment and forwards it.
 *
 * Format: `<base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>`.
 * Mirrors the JWT structure conceptually but without the unused parts
 * (header, claims registry) — keeps the URL short.
 */
import crypto from "crypto";

export type UnsubscribeKind = "weekly_digest";

export type UnsubscribePayload = {
  /** User ID. */
  uid: string;
  /** Expiry as Unix epoch ms. */
  exp: number;
  /** Email category — extend the union if we add more unsubscribe surfaces. */
  k: UnsubscribeKind;
};

const TOKEN_VERSION_TAG = "v1";
const DEFAULT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input: string): Buffer {
  // base64url → base64
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  // re-pad to a multiple of 4
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function sign(payload: string, secret: string): string {
  return base64urlEncode(
    crypto.createHmac("sha256", secret).update(payload).digest()
  );
}

export function mintUnsubscribeToken(
  params: { userId: string; kind: UnsubscribeKind; now?: Date; ttlMs?: number },
  secret: string
): string {
  if (!secret) {
    throw new Error("mintUnsubscribeToken called without a signing secret");
  }
  const now = params.now ?? new Date();
  const payload: UnsubscribePayload = {
    uid: params.userId,
    exp: now.getTime() + (params.ttlMs ?? DEFAULT_TTL_MS),
    k: params.kind,
  };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = sign(`${TOKEN_VERSION_TAG}.${encoded}`, secret);
  // Prefix the token with the version tag so future format changes can
  // co-exist with already-sent emails.
  return `${TOKEN_VERSION_TAG}.${encoded}.${signature}`;
}

export type VerifyResult =
  | { ok: true; payload: UnsubscribePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "unknown_version" };

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now: Date = new Date()
): VerifyResult {
  if (!token || typeof token !== "string") return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, encoded, signature] = parts as [string, string, string];

  if (version !== TOKEN_VERSION_TAG) {
    return { ok: false, reason: "unknown_version" };
  }

  const expected = sign(`${version}.${encoded}`, secret);
  // Constant-time compare to avoid leaking via timing.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: UnsubscribePayload;
  try {
    const parsed = JSON.parse(base64urlDecode(encoded).toString("utf8"));
    if (
      !parsed ||
      typeof parsed.uid !== "string" ||
      typeof parsed.exp !== "number" ||
      typeof parsed.k !== "string"
    ) {
      return { ok: false, reason: "malformed" };
    }
    payload = parsed as UnsubscribePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.exp < now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}

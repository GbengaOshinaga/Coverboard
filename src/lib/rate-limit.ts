/**
 * Rate limiting for authentication endpoints.
 *
 * Backed by Upstash Redis so it works correctly across Vercel's serverless
 * Lambdas (an in-memory limiter would be useless — each cold-started function
 * has its own state). One Redis call per request; cost is well within the
 * Upstash free tier for our traffic profile.
 *
 * Fail-closed in production when env vars are missing: returns 503 with a
 * loud server log so an unconfigured deploy can't silently disable rate
 * limiting (the Privacy Policy lists this as a security control). Bypasses
 * in non-production so local dev doesn't need Upstash credentials.
 */
import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type LimiterName =
  | "login"
  | "signup"
  | "passwordReset"
  | "emailVerificationResend";

const LIMITER_CONFIG: Record<
  LimiterName,
  { tokens: number; window: `${number} ${"s" | "m" | "h" | "d"}` }
> = {
  // 10 attempts/min/IP — generous enough for a fat-fingered user, tight
  // enough to make brute-forcing a hashed password infeasible.
  login: { tokens: 10, window: "1 m" },
  // Signup is rare — 5/hour/IP cuts off automated org-creation attacks.
  signup: { tokens: 5, window: "1 h" },
  // 5/hour/IP. Forgot-password sends real emails; we don't want to be
  // weaponised into a free email-blasting service.
  passwordReset: { tokens: 5, window: "1 h" },
  // Email-verification resend — same email-sending concern as forgot-password.
  // Bucketed separately so we can tune independently if abuse patterns differ.
  emailVerificationResend: { tokens: 5, window: "1 h" },
};

let redisClient: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return null;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

const limiterCache: Partial<Record<LimiterName, Ratelimit>> = {};
function getLimiter(name: LimiterName): Ratelimit | null {
  const cached = limiterCache[name];
  if (cached) return cached;
  const redis = getRedis();
  if (!redis) return null;
  const cfg = LIMITER_CONFIG[name];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.tokens, cfg.window),
    prefix: `coverboard:ratelimit:${name}`,
    analytics: false,
  });
  limiterCache[name] = limiter;
  return limiter;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; response: NextResponse; retryAfterSeconds: number };

/**
 * Check whether `identifier` has exceeded the limit for `limiterName`.
 * Returns a NextResponse pre-built to short-circuit on the failure path.
 */
export async function checkAuthRateLimit(
  identifier: string,
  limiterName: LimiterName
): Promise<RateLimitResult> {
  const limiter = getLimiter(limiterName);
  if (!limiter) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        `Rate limiter "${limiterName}" is not configured. ` +
          `Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. ` +
          `Refusing to handle this auth request to keep the security ` +
          `posture honest (Privacy Policy section 9 claims this control).`
      );
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Service temporarily unavailable" },
          { status: 503 }
        ),
        retryAfterSeconds: 0,
      };
    }
    return { ok: true };
  }

  const { success, reset } = await limiter.limit(identifier);
  if (success) return { ok: true };

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((reset - Date.now()) / 1000)
  );
  return {
    ok: false,
    response: NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    ),
    retryAfterSeconds,
  };
}

/**
 * Best-effort client IP extraction for rate-limit keying. Falls back to
 * "unknown" so a missing/stripped header doesn't get rate-limited under the
 * empty string (which would be a shared bucket — easy DoS target).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * IP extraction for NextAuth's `authorize` callback, whose `req.headers`
 * type is the Node-style `Record<string, string | string[] | undefined>`
 * rather than the Fetch `Headers` object passed to App Router routes.
 */
export function getClientIpFromAuthorizeReq(
  headers: Record<string, string | string[] | undefined> | undefined
): string {
  if (!headers) return "unknown";
  const xff = headers["x-forwarded-for"];
  const xffValue = Array.isArray(xff) ? xff[0] : xff;
  if (xffValue) {
    const first = xffValue.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers["x-real-ip"];
  const realValue = Array.isArray(real) ? real[0] : real;
  if (realValue) return realValue.trim();
  return "unknown";
}

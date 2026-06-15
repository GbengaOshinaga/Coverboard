/**
 * Shared auth check for Vercel cron endpoints.
 *
 * Vercel sets `Authorization: Bearer $CRON_SECRET` on each scheduled invocation
 * when `CRON_SECRET` is present in the environment. We mirror that:
 *
 *   - Secret set:                       require exact Bearer match (else 401)
 *   - Secret missing, production:       refuse with 500 (fail closed loudly so
 *                                       the first cron run pages someone, rather
 *                                       than silently opening a destructive
 *                                       endpoint to the internet)
 *   - Secret missing, non-production:   allow (local dev / preview convenience)
 *
 * Returns null on success, a NextResponse to short-circuit on failure.
 */
import { NextResponse } from "next/server";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export function verifyCronAuth(request: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (!expected) {
    if (isProduction) {
      console.error(
        "CRON_SECRET is not set. Refusing to run cron endpoint to avoid exposing it to the internet."
      );
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Cron not configured" },
          { status: 500 }
        ),
      };
    }
    return { ok: true };
  }

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${expected}`) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true };
}

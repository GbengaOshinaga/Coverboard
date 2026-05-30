import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Health check for external uptime monitors (BetterStack, Cronitor, etc.).
 *
 * Behaviour:
 *   - 200 + `{ status: "ok" }` when the app process is up and the DB is
 *     reachable.
 *   - 503 + `{ status: "error" }` when the DB ping fails. We log to console
 *     but deliberately do not return the underlying error message — uptime
 *     monitor logs aren't an audited surface and the DB error string can
 *     leak connection details.
 *
 * Intentionally checks only the database — that is the single dependency
 * whose absence renders the whole product unusable. Stripe / email
 * outages don't bring down sign-in or leave management, so we don't fold
 * them into the binary "is the service alive" signal.
 *
 * Public on purpose: monitors can't sign in. The response is small and
 * cacheable for at most a few seconds at the CDN; we set `no-store` so the
 * monitor always sees fresh DB state.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function commitSha(): string | undefined {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    undefined
  );
}

export async function GET() {
  const startedAt = Date.now();

  try {
    // Cheapest possible round-trip to the DB. No table scan, no allocation.
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Health check failed: database unreachable", err);
    return NextResponse.json(
      {
        status: "error",
        check: "database",
        commit: commitSha(),
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      commit: commitSha(),
      latencyMs: Date.now() - startedAt,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

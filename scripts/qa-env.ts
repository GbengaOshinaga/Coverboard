import Module from "node:module";

/**
 * Imported first by scripts/seed-qa-team.ts, before anything that reads these
 * keys when it loads: the QA team is made through the app's own code, which
 * would otherwise email, post to Slack and send analytics for every booking.
 * An empty value counts as set, so Prisma's .env loading doesn't refill them.
 */
for (const key of [
  "RESEND_API_KEY",
  "SLACK_CLIENT_SECRET",
  "SLACK_SIGNING_SECRET",
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "STRIPE_SECRET_KEY",
]) {
  process.env[key] = "";
}

// "server-only" only resolves inside Next.js; outside it, use Next's own
// empty version so server modules can be loaded from a script.
const serverOnly = require.resolve("next/dist/compiled/server-only/empty.js");
const resolve = (Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: typeof resolve })._resolveFilename = function (request, ...rest) {
  return request === "server-only" ? serverOnly : resolve.call(this, request, ...rest);
};

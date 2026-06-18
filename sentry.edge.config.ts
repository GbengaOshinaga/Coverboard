import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

// Inert during `next build` — see sentry.server.config.ts for rationale.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (dsn && !isBuildPhase) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

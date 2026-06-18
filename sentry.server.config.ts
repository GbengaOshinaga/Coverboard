import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

// Don't initialise Sentry during `next build`. Tracing a build is meaningless,
// and the SDK running inside build/prerender workers is a likely source of
// intermittent "Failed to collect page data" flakes. Runtime is unaffected.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (dsn && !isBuildPhase) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    sendDefaultPii: false,
  });
}

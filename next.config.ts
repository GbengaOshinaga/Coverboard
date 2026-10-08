import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";

// Content Security Policy.
//
// Notes on the trade-offs:
// - 'unsafe-inline' for script-src lets Next.js's hydration/runtime scripts
//   execute. Tightening to nonces requires per-request middleware
//   coordination; we ship the rest of CSP without nonces and treat that as
//   a follow-up. Even without nonces, CSP blocks injection of external
//   scripts, restricts XHR exfiltration, prevents clickjacking via
//   frame-ancestors, and forbids `<object>` / plugins.
// - PostHog is reverse-proxied through /ingest/* (see `rewrites` below) so
//   from the browser's perspective it's same-origin — covered by 'self'.
//   Sentry's ingest is direct from the browser, so connect-src allows the
//   DSN's own host. Sentry regions use different hosts (e.g. EU DSNs are
//   *.ingest.de.sentry.io, which *.ingest.sentry.io does NOT match — that
//   silently blocked every browser error report), so the host is read from
//   the DSN, with the known regional wildcards as a fallback.
// - Stripe Elements loads js.stripe.com as a script and renders hooks /
//   card iframes from js.stripe.com + hooks.stripe.com. Stripe's CSP list
//   (docs.stripe.com/security/guide#content-security-policy) also needs
//   *.js.stripe.com in script-src and frame-src: Stripe.js starts frames on
//   those origins, and blocking them can leave the card form blank.
// - The CSP is only emitted in production builds; `next dev` uses HMR with
//   eval'd scripts and websockets that a tight CSP would break. Vercel
//   preview deployments use NODE_ENV=production, so previews get the same
//   CSP as production — which is where you want to catch a CSP regression.
function sentryConnectSources(): string {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  try {
    if (dsn) return `https://${new URL(dsn).host}`;
  } catch {
    // Malformed DSN: fall through to the wildcards.
  }
  return "https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io";
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com ${sentryConnectSources()}`,
  "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // 2 years, with subdomains, preload-list eligible. Browsers cache this for
  // the duration; the preload entry is opt-in via hstspreload.org once the
  // domain is stable.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Belt-and-braces with CSP frame-ancestors. Older browsers honour XFO.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features Coverboard doesn't use, so a future XSS can't
  // request them. Payment is the exception: Apple Pay and Google Pay inside
  // Stripe's Payment Element use the Payment Request API from Stripe's
  // frames, so it's allowed for Stripe only (payment=() blocked them).
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      'payment=(self "https://js.stripe.com" "https://*.js.stripe.com")',
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  ...(isProduction
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep Node SDKs out of the client webpack graph (posthog-node uses node: imports).
  serverExternalPackages: ["posthog-node"],
  // Don't advertise Next.js / Vercel via X-Powered-By; minor info leak.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});

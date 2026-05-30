import "server-only";

import { PostHog } from "posthog-node";
import type { AnalyticsEventName } from "./events";
import { sanitizeAnalyticsProperties } from "./sanitize";

export type ServerAnalyticsContext = {
  userId?: string;
  organizationId?: string;
  role?: string;
  plan?: string;
};

let posthog: PostHog | null = null;

function getPostHog(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!key) return null;
  if (!posthog) {
    posthog = new PostHog(key, {
      host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthog;
}

function distinctId(ctx: ServerAnalyticsContext): string {
  if (ctx.userId) return ctx.userId;
  if (ctx.organizationId) return `org:${ctx.organizationId}`;
  return "anonymous";
}

/**
 * Server-side product analytics. No-ops when PostHog is not configured.
 * Never pass names, emails, notes, or other HR/PII in `properties`.
 */
export function trackServer(
  event: AnalyticsEventName,
  properties?: Record<string, unknown>,
  context: ServerAnalyticsContext = {}
): void {
  const client = getPostHog();
  if (!client) return;

  const safe = sanitizeAnalyticsProperties(properties);
  const groups = context.organizationId
    ? { organization: context.organizationId }
    : undefined;

  client.capture({
    distinctId: distinctId(context),
    event,
    properties: {
      ...safe,
      ...(context.role ? { role: context.role } : {}),
      ...(context.plan ? { plan: context.plan } : {}),
    },
    groups,
  });

  void client.flush().catch(() => undefined);
}

export async function shutdownAnalytics(): Promise<void> {
  if (posthog) {
    await posthog.shutdown();
    posthog = null;
  }
}

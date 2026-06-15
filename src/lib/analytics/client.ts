"use client";

import posthog from "posthog-js";
import type { AnalyticsEventName } from "./events";
import { sanitizeAnalyticsProperties } from "./sanitize";

let initialized = false;

export function initPostHog(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!key || initialized || typeof window === "undefined") return;
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.posthog.com",
    defaults: "2026-01-30",
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    capture_exceptions: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

export function identifyUser(params: {
  userId: string;
  organizationId: string;
  role?: string;
  plan?: string;
}): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  initPostHog();
  posthog.identify(params.userId, {
    role: params.role,
    plan: params.plan,
  });
  posthog.group("organization", params.organizationId, {
    plan: params.plan,
  });
}

export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
}

/** Client-side events (e.g. UI funnels). Prefer server `trackServer` for authoritative actions. */
export function trackClient(
  event: AnalyticsEventName,
  properties?: Record<string, unknown>
): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  initPostHog();
  posthog.capture(event, sanitizeAnalyticsProperties(properties));
}

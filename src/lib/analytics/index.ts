/**
 * Client-safe analytics exports only.
 * Server routes must import from `@/lib/analytics/server` — never from here.
 */
export { AnalyticsEvents, type AnalyticsEventName } from "./events";
export { sanitizeAnalyticsProperties } from "./sanitize";
export {
  initPostHog,
  identifyUser,
  resetAnalytics,
  trackClient,
} from "./client";

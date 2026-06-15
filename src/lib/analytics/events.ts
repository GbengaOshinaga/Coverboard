/** Canonical product analytics event names — use these instead of raw strings. */
export const AnalyticsEvents = {
  SIGNUP_COMPLETED: "signup_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",
  TEAM_MEMBER_ADDED: "team_member_added",
  LEAVE_REQUEST_CREATED: "leave_request_created",
  LEAVE_REQUEST_APPROVED: "leave_request_approved",
  UK_STATUTORY_ENABLED: "uk_statutory_enabled",
  BILLING_CARD_ADDED: "billing_card_added",
  SUBSCRIPTION_CANCELED: "subscription_canceled",
  SUBSCRIPTION_REACTIVATED: "subscription_reactivated",
  PLAN_CHANGED: "plan_changed",
  ACCOUNT_DELETION_REQUESTED: "account_deletion_requested",
  USER_LOGGED_IN: "user_logged_in",
  LOGIN_FAILED: "login_failed",
  SIGNUP_FAILED: "signup_failed",
  LEAVE_REQUEST_CANCELLED: "leave_request_cancelled",
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

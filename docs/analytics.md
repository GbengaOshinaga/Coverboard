# Analytics & error monitoring

Coverboard uses **Sentry** for errors and **PostHog (EU)** for product analytics. Both are optional: if env vars are unset, the app runs normally with no tracking.

## Setup

### Sentry

1. Create a project at [sentry.io](https://sentry.io) (Next.js).
2. Add to Vercel / `.env.local`:

```bash
NEXT_PUBLIC_SENTRY_DSN="https://...@....ingest.sentry.io/..."
# Optional — source map upload in CI
SENTRY_ORG="your-org"
SENTRY_PROJECT="coverboard"
```

### PostHog (EU)

1. Create a project at [eu.posthog.com](https://eu.posthog.com).
2. Add:

```bash
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN="phc_..."
NEXT_PUBLIC_POSTHOG_HOST="https://eu.i.posthog.com"
```

3. Update your privacy policy to mention usage analytics.

## Events (launch set)

| Event | When | Properties (no PII) |
|-------|------|---------------------|
| `signup_completed` | Account created | `selected_plan`, `stripe_provisioned` |
| `onboarding_completed` | Wizard finished | `countries`, `has_gb`, `invite_count`, … |
| `team_member_added` | Member created | `is_first_member`, `work_country`, … |
| `leave_request_created` | Leave submitted | `days_requested`, `is_statutory`, `leave_category` |
| `leave_request_approved` | Manager approves | `cover_override`, `is_statutory` |
| `uk_statutory_enabled` | UK types seeded | `source`: `onboarding` \| `settings` |
| `billing_card_added` | Payment method saved | `plan_key` |
| `subscription_canceled` | Cancel at period end | `scheduled` |
| `subscription_reactivated` | Undo cancel | `deletion_canceled` |

Users are identified by **user id**; orgs by **organization** group. Never send names, emails, sickness notes, or IP addresses in analytics properties (`src/lib/analytics/sanitize.ts` blocks common PII keys).

## Code

- `src/lib/analytics/` — `trackServer()` (API routes), `trackClient()` (UI, optional)
- `src/components/analytics/posthog-provider.tsx` — session identify + pageviews
- `sentry.*.config.ts` + `src/instrumentation.ts` — Sentry bootstrap

## Suggested PostHog funnels (week 1)

1. `signup_completed` → `onboarding_completed` → `team_member_added`
2. `onboarding_completed` → `leave_request_created`
3. `signup_completed` → `billing_card_added` (before trial end)

## Local development

Leave env vars empty. No events or errors are sent externally.

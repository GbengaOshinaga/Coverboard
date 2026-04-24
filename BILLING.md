# Billing & Subscriptions

Coverboard bills through **Stripe** with monthly GBP subscriptions on four tiers (Starter / Growth / Scale / Pro) and a **14-day free trial** on every new signup. No card is collected at signup — when the trial ends the subscription pauses until a card is added.

This document covers the **implementation**, **data model**, **webhook contract**, **lifecycle flows**, and **operational runbook** for the Stripe integration. For pricing copy shown on the landing page, see `src/config/pricing.ts`.

---

## 1. Pricing tiers

| Tier    | Monthly | Stripe product name     | Default features unlocked |
|---------|---------|--------------------------|---------------------------|
| Starter | £19     | Coverboard Starter       | Core leave management, 2 admins |
| Growth  | £49     | Coverboard Growth        | + Bradford Factor, pro-rata, SSP, unlimited admins |
| Scale   | £99     | Coverboard Scale         | + Parental tracker, holiday pay, compliance reports |
| Pro     | £179    | Coverboard Pro           | + API access, audit exports, custom policies |

All prices are `recurring`, `interval: month`, `currency: gbp`. Amounts are in pence in Stripe (`1900` / `4900` / `9900` / `17900`).

The `TRIAL` plan grants the full Pro feature set so customers experience the whole product before deciding. The `LOCKED` plan grants nothing — the lock screen takes over the dashboard.

---

## 2. Environment variables

Four keys live in `.env.local` (see `.env.example`):

```bash
STRIPE_SECRET_KEY="sk_test_..."         # Server-side API calls
STRIPE_PUBLISHABLE_KEY="pk_test_..."    # Documentation only
STRIPE_WEBHOOK_SECRET="whsec_..."       # Signature verification
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."  # Shipped to the browser (Stripe Elements)
```

Optional — override the seeded price IDs without editing `src/config/stripePrices.ts`:

```bash
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_GROWTH="price_..."
STRIPE_PRICE_SCALE="price_..."
STRIPE_PRICE_PRO="price_..."
```

Get keys from https://dashboard.stripe.com/apikeys (test and live are separate accounts).

---

## 3. First-time setup

### 3a. Install the SDK

Already done in `package.json`:

```bash
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
```

### 3b. Seed the four products in Stripe

Run once per Stripe account (test, then live):

```bash
npx tsx scripts/createStripeProducts.ts
```

The script is **idempotent**: it looks up products by name and reuses existing prices that match `unit_amount + currency + month`. On the first run it prints:

```
Coverboard Starter     product=prod_xxx price=price_xxx (£19/mo)
Coverboard Growth      product=prod_xxx price=price_xxx (£49/mo)
...
Paste into src/config/stripePrices.ts:
export const STRIPE_PRICE_IDS = {
  starter: "price_xxx",
  ...
}
```

Either paste those IDs into `src/config/stripePrices.ts` **or** set the `STRIPE_PRICE_*` env vars above.

### 3c. Register the webhook

**Local development** — use the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.

**Production** — add the endpoint in Stripe Dashboard → Developers → Webhooks:

- URL: `https://yourdomain.com/api/webhooks/stripe`
- Events:
  - `customer.subscription.trial_will_end`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.paused`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

---

## 4. Data model

### 4a. `SubscriptionPlan` enum

```prisma
enum SubscriptionPlan {
  TRIAL
  STARTER
  GROWTH
  SCALE
  PRO
  LOCKED
}
```

`TRIAL` and `LOCKED` are lifecycle states; the four middle values are the billable tiers that `planAtLeast()` in `src/lib/plans.ts` understands.

### 4b. `Organization` fields

All fields except `plan` are nullable/defaulted so existing rows are unaffected:

| Field                    | Type                | Purpose |
|--------------------------|---------------------|---------|
| `plan`                   | `SubscriptionPlan`  | Current lifecycle/tier (default `TRIAL`) |
| `stripeCustomerId`       | `String?` UNIQUE    | Stripe customer |
| `stripeSubscriptionId`   | `String?` UNIQUE    | Stripe subscription |
| `stripePriceId`          | `String?`           | Current price (used to derive tier) |
| `subscriptionStatus`     | `String?`           | Mirrors Stripe: `trialing` / `active` / `past_due` / `paused` / `canceled` |
| `trialEndsAt`            | `DateTime?`         | Cached from `subscription.trial_end` so the banner doesn't hit Stripe each render |
| `cardAdded`              | `Boolean`           | True once a payment method is attached |
| `cancelAtPeriodEnd`      | `Boolean`           | True after the user schedules cancellation |
| `currentPeriodEnd`       | `DateTime?`         | Cached from Stripe — next billing date shown in UI |

Migration: `prisma/migrations/20260423120000_stripe_billing/migration.sql`.

### 4c. Source of truth

**Stripe is authoritative**, the database is a cache. The webhook handler is the **only** code path that updates `subscriptionStatus`, `currentPeriodEnd`, `cardAdded` (on successful invoice), and `plan` after the trial ends. API routes only write `cardAdded=true` on optimistic local update and `cancelAtPeriodEnd` mirrors the Stripe call.

---

## 5. Key files

| File | Role |
|------|------|
| `src/lib/stripe.ts` | Stripe client singleton — `null` when `STRIPE_SECRET_KEY` is unset (fail-soft) |
| `src/config/stripePrices.ts` | Price-ID map + helpers (`planKeyFromPriceId`, `PLAN_DISPLAY_NAME`, `PLAN_MONTHLY_PRICE_GBP`) |
| `scripts/createStripeProducts.ts` | Idempotent product/price seed script |
| `src/app/api/auth/signup/route.ts` | Creates customer + trialing subscription at signup |
| `src/app/api/billing/setup-intent/route.ts` | Creates SetupIntent for the add-card page |
| `src/app/api/billing/confirm-payment/route.ts` | Attaches PM to customer + subscription |
| `src/app/api/billing/summary/route.ts` | Billing page data (plan, status, last 5 invoices) |
| `src/app/api/billing/cancel/route.ts` | Schedule cancel-at-period-end |
| `src/app/api/billing/reactivate/route.ts` | Undo scheduled cancellation |
| `src/app/api/webhooks/stripe/route.ts` | Webhook entry point + event handlers |
| `src/lib/billing-emails.ts` | Transactional emails (Resend) |
| `src/lib/trial.ts` | `computeTrialState()` — days left + banner tone |
| `src/lib/planFeatures.ts` | `PLAN_FEATURES`, `hasFeature`, `hasFeatureForEnum`, `minimumPlanFor` |
| `src/components/layout/trial-banner.tsx` | Persistent banner for admins on trialing orgs without a card |
| `src/middleware.ts` | Gates `plan=LOCKED` orgs everywhere except billing/auth |
| `src/app/(dashboard)/settings/billing/page.tsx` | Billing summary, invoices, cancel/reactivate |
| `src/app/(dashboard)/settings/billing/add-payment/` | Stripe Elements card form |
| `src/app/(dashboard)/settings/billing/change-plan/page.tsx` | Stub — points users at email |
| `src/app/locked/page.tsx` | Full-page lock overlay |

---

## 6. Signup and trial lifecycle

```
 ┌──────────┐   plan selected   ┌────────────────────┐
 │ /signup  │ ─────────────────▶│ POST /api/auth/    │
 └──────────┘                   │      signup        │
                                └────────┬───────────┘
                                         │ creates User, Organization(plan=TRIAL)
                                         │ ┌───────────────────────────────┐
                                         └▶│ stripe.customers.create       │
                                           │ stripe.subscriptions.create   │
                                           │   trial_period_days: 14       │
                                           │   trial_settings.end_behavior │
                                           │     .missing_payment_method:  │
                                           │       "pause"                 │
                                           └──────────────┬────────────────┘
                                                          │
                    persists stripeCustomerId/stripeSubscriptionId/
                    stripePriceId/trialEndsAt/subscriptionStatus="trialing"
```

**At signup**: Stripe provisioning is wrapped in try/catch. If Stripe is unreachable or unconfigured, the user still gets an account with `plan=TRIAL` and `trialEndsAt = now + 14 days` — they can add a card later.

**During the trial**:

- Every dashboard page renders `TrialBanner` (server component, reads `trialEndsAt` from DB — no Stripe API call per page).
- Banner colour by days remaining: blue (> 3 days), amber (2–3), red (0–1).
- Banner is admin-only and hidden once `cardAdded=true`.

**When the trial ends**:

- **Card added** → Stripe auto-charges on day 14. `invoice.payment_succeeded` fires, webhook sets `subscriptionStatus=active`, `plan` is set from `stripePriceId`, and a welcome email is sent.
- **No card** → Stripe pauses the subscription. `customer.subscription.paused` fires, webhook sets `plan=LOCKED` and `subscriptionStatus=paused`, and the lock email is sent.

---

## 7. Add-payment flow

`/settings/billing/add-payment` uses the standard **SetupIntent + Stripe Elements** pattern:

1. Server component renders `<AddPaymentForm>` with the publishable key and current plan.
2. Client calls `POST /api/billing/setup-intent` → server creates `SetupIntent` with `usage: 'off_session'` and returns the client secret.
3. `@stripe/react-stripe-js` renders `<PaymentElement>` inside `<Elements>`.
4. On submit, `stripe.confirmSetup({ redirect: 'if_required' })` tokenises the card.
5. Client calls `POST /api/billing/confirm-payment` with the returned `paymentMethodId`.
6. Server attaches the PM to the customer, sets it as the invoice default, sets it as the subscription default, and writes `cardAdded=true`.
7. Success UI replaces the form.

**Error handling**:
- `card_declined` → "Your card was declined. Please try a different card."
- Any other Stripe error → message propagated; generic fallback `"Something went wrong. Please try again."`

The browser never sees the customer ID or raw card details.

---

## 8. Cancellation flow

Cancellation is always **at period end** — users keep access until their next billing date:

1. User clicks **Cancel subscription** on `/settings/billing`.
2. Modal confirms: "Access continues until {currentPeriodEnd}, then your account will be locked."
3. `POST /api/billing/cancel` → `stripe.subscriptions.update(id, { cancel_at_period_end: true })`, DB mirror to `cancelAtPeriodEnd=true`.
4. Billing page shows an amber banner + **Reactivate** button.
5. Reactivate undoes it with `cancel_at_period_end: false`.
6. If left in place, Stripe eventually fires `customer.subscription.deleted` → webhook sets `plan=LOCKED`.

---

## 9. Webhook handler

Endpoint: `POST /api/webhooks/stripe`. App Router reads the raw body via `request.text()` so the Stripe SDK can verify the signature.

Signature verification failures return **400**. Any unhandled event or downstream exception returns **200** (we don't want Stripe retrying a bug forever — the error is logged for us to fix).

| Event                                      | What the handler does |
|--------------------------------------------|-----------------------|
| `customer.subscription.trial_will_end`     | Email admin: "Trial ends in 3 days" (Stripe fires this automatically 3 days out) |
| `customer.subscription.updated`            | Mirror `status`, `cancel_at_period_end`, `trial_end`, `current_period_end`; promote `plan` to the tier if `status=active`; on `past_due` email admin |
| `customer.subscription.deleted`            | Set `plan=LOCKED`, `subscriptionStatus=canceled`; email cancellation confirmation |
| `customer.subscription.paused`             | Set `plan=LOCKED`, `subscriptionStatus=paused`; email reactivation link |
| `invoice.payment_succeeded`                | Set `subscriptionStatus=active`, `cardAdded=true`, promote `plan` from `stripePriceId`; if this was the trial→paid transition, send welcome email |
| `invoice.payment_failed`                   | Set `subscriptionStatus=past_due` and email admin with update-card link. **Do not lock** — Stripe will retry. Lock happens only on `canceled`/`paused`. |

---

## 10. Middleware-based lock screen

`src/middleware.ts` runs on every non-asset route and:

1. Loads the NextAuth JWT with `getToken()`.
2. If no token → pass through (NextAuth itself handles the login redirect).
3. If `token.plan === "LOCKED"` and the path is **not** in the allow-list, redirect to `/locked`.

Allow-list (configurable via the `ALLOWED_WHEN_LOCKED` regex array):

- `/locked`
- `/settings/billing/**`
- `/settings/profile/**`
- `/api/billing/**`
- `/api/auth/**`
- `/login`, `/signup`, `/logout`

The JWT carries `plan` (stamped in `src/lib/auth.ts` `authorize()` + refreshed from the DB at most once per hour, and whenever the client calls `session.update()`). This avoids forcing a re-login when the plan changes in the webhook.

---

## 11. Feature gating

`src/lib/planFeatures.ts` defines a flat map of plan → feature keys:

```ts
hasFeature("growth", "bradford_factor")   // true
hasFeature("growth", "api_access")        // false
hasFeatureForEnum("TRIAL", "api_access")  // true — trial = pro bundle
hasFeatureForEnum("LOCKED", "annual_leave") // false
minimumPlanFor("earnings_history")        // "scale"
```

Use `hasFeature` in UI (lowercase) and `hasFeatureForEnum` in API routes (takes the Prisma enum directly).

**Upgrade prompts** — when a user hits a gated UI element:

```tsx
"This feature is available on the {minimumPlanFor(feature)} plan and above. "
<Link href="/settings/billing">Upgrade →</Link>
```

**Server-side (API routes)** — return 403 with a structured body so the client can render an upgrade banner:

```ts
if (!hasFeatureForEnum(org.plan, "api_access")) {
  return NextResponse.json(
    {
      error: "PLAN_LIMIT",
      message: "This feature requires the Pro plan or above",
      upgrade_url: "/settings/billing",
    },
    { status: 403 }
  );
}
```

Existing helpers in `src/lib/plans.ts` (`hasAuditTrail`, `hasApiAccess`, `hasPrioritySupport`, etc.) still work — they now accept the widened `AnyPlan` type (`TRIAL`/`LOCKED` resolve to `false` for tier-ordered checks).

---

## 12. Emails

All billing emails go through `src/lib/billing-emails.ts` which in turn calls `sendEmail()` from `src/lib/email.ts` (Resend). If `RESEND_API_KEY` is unset, emails are logged to the console and the flow continues.

| Function                     | Triggered by |
|------------------------------|--------------|
| `emailTrialEndingSoon`       | `customer.subscription.trial_will_end` |
| `emailPaymentFailed`         | `invoice.payment_failed` + `subscription.updated → past_due` |
| `emailSubscriptionCanceled`  | `customer.subscription.deleted` |
| `emailAccountPaused`         | `customer.subscription.paused` |
| `emailWelcomeActive`         | First `invoice.payment_succeeded` after trialing |

---

## 13. Testing

Unit tests live next to the code they exercise and run with `npm test` (`tsx --test`):

- `src/lib/planFeatures.test.ts` — full-matrix coverage for each plan, TRIAL = pro, LOCKED = empty, unknown/nullable plan, `minimumPlanFor`, enum-mapping helper.
- `src/lib/trial.test.ts` — countdown states at 14/4/3/2/1/<1/0/expired days.

Stripe SDK calls themselves are not unit-tested; for integration testing use `stripe trigger <event>` with the Stripe CLI while `stripe listen` forwards to local dev, e.g.:

```bash
stripe trigger customer.subscription.trial_will_end
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.paused
```

---

## 14. Operational runbook

| Question | Answer |
|----------|--------|
| A customer can't log in — says "Your trial has ended" | They hit the lock screen. Either their card was declined (check Stripe dashboard for the customer) or they never added one. Fix via `/settings/billing/add-payment` — they can access that even when locked. |
| I changed someone's plan in Stripe and the app didn't update | Webhook delivery may have failed. Replay the last `customer.subscription.updated` from Stripe Dashboard → Developers → Webhooks → select endpoint → Events. |
| I need to extend someone's trial | `stripe.subscriptions.update(id, { trial_end: <unix seconds> })`. The `subscription.updated` webhook will sync `trialEndsAt` and clear any lock state. |
| I need to refund an invoice | Refund in the Stripe Dashboard. No app-side action required — no invoice state is stored in our DB, we read them live from Stripe in `/api/billing/summary`. |
| A customer wants to downgrade | There is no self-serve plan switcher yet — `/settings/billing/change-plan` is a stub pointing to email. To change a plan, update the subscription's price in Stripe; the `subscription.updated` webhook will promote the tier on the next invoice success. |

---

## 15. Known limitations

- **No self-serve plan change** — `change-plan` is stubbed; email-only for now.
- **Card-only** — Stripe supports BACS/SEPA/etc but this implementation passes `payment_method_types: ["card"]` to both the SetupIntent and the subscription.
- **No proration surface** — when someone upgrades mid-cycle, Stripe prorates by default. The billing UI doesn't yet render the proration line item.
- **No dunning UI** — `past_due` shows a badge and triggers an email, but there is no in-app "update your card" modal beyond the banner.
- **Trial can't be extended in-app** — use the Stripe Dashboard.
- **One subscription per organization** — there's no support for add-on subscriptions (e.g. a metered API add-on).

<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# Stripe billing and trial management

Coverboard uses Stripe for monthly subscription billing in GBP. Every new signup gets a 14-day free trial — no card required to start. When the trial ends, the account either auto-charges (if a card has been added) or pauses until one is.

This page covers what admins need to know day-to-day. The full implementation runbook (webhook contract, env variables, lifecycle internals) is in `BILLING.md` at the repository root.

---

## The four plans

| Plan | Monthly | Tagline |
|---|---|---|
| Starter | £19 | Core leave management |
| Growth | £49 | Compliance & reporting |
| Scale | £99 | Advanced HR operations |
| Pro | £179 | Enterprise-ready |

All plans bill **monthly only** (no annual billing) and have **no employee count limits** — you pay for the feature set, not by seat. Starter is capped at 2 admin users; Growth and above have unlimited admins.

The exact feature included in each tier is defined in `src/lib/planFeatures.ts`. A few headline gates:

- **Bradford Factor, SSP tracking, pro-rata, right to work, bank holiday region config** — Growth and above
- **Parental tracker, KIT/SPLIT day tracking, holiday pay 52-week averaging, carry-over rules, absence analytics, full UK compliance report pack** — Scale and above
- **Custom leave policies, GDPR data residency configuration, audit trail exports, API access** — Pro

During the **14-day free trial** every new org gets the full Pro feature set so you can test what you'd actually be paying for.

---

## Signup and trial

There is no card capture at signup. When a user creates an account:

1. A `User` and `Organization` are created with `plan = TRIAL` and `trialEndsAt = now + 14 days`
2. A Stripe customer and trialing subscription are provisioned in the background (if Stripe is unreachable, the user still gets an account — they can add a card later)
3. The trial subscription is configured with `trial_settings.end_behavior.missing_payment_method: "pause"` — meaning if the trial ends without a card on file, Stripe pauses rather than retries

Throughout the trial, every dashboard page renders a banner for admins. Its colour escalates as the deadline approaches:
- **Blue** — more than 3 days left
- **Amber** — 2 to 3 days left
- **Red** — final day

The banner disappears once a card is added.

---

## Adding a card

**Settings → Billing → Add payment method.**

The form uses Stripe Elements (PaymentElement) — your card details never touch Coverboard's servers. We create a `SetupIntent`, Stripe tokenises the card client-side, and the resulting payment method is attached to the customer and set as the subscription default. Card-only payment methods (no BACS or SEPA today).

**On declined cards:**
- `card_declined` → "Your card was declined. Please try a different card."
- Other errors → message propagated from Stripe; generic fallback if none

---

## What happens at trial end

**With a card on file** — Stripe auto-charges on day 14, the `invoice.payment_succeeded` webhook fires, the org's `plan` is promoted to whichever tier the price ID maps to, `subscriptionStatus` becomes `active`, and a welcome email goes out.

**Without a card** — Stripe pauses the subscription, the `customer.subscription.paused` webhook fires, the org's `plan` is set to `LOCKED`, and the lock screen takes over the dashboard. The admin is emailed a reactivation link. From the lock screen they can still reach **Settings → Billing → Add payment method** to recover.

---

## Cancellation

Cancellation is always **at period end** — you keep access until the next billing date.

**Settings → Billing → Cancel subscription** opens a confirmation dialog explaining the date you'll lose access. On confirm, Stripe is updated with `cancel_at_period_end: true` and the billing page shows an amber banner with a **Reactivate** button.

If you change your mind before period end, click **Reactivate** — Stripe undoes the scheduled cancellation and the banner clears. If you let it run out, Stripe fires `customer.subscription.deleted`, the plan is set to `LOCKED`, and the org enters the [30-day data deletion grace period](data-deletion-and-trial-expiry.md).

---

## Invoices and receipts

The billing page shows your last 5 invoices with a direct link to each Stripe-hosted PDF. There's no separate receipts feature — Stripe is the source of truth for invoice history. If you need an older invoice, ask support and we can pull it from Stripe.

---

## Operational notes

- **All billing emails** (trial ending, payment failed, cancelled, paused, welcome) come from Resend via `src/lib/billing-emails.ts`. If `RESEND_API_KEY` is unset, the email is logged to the server console and the flow continues.
- **The webhook is the source of truth for subscription state.** If something looks out of sync between Stripe and Coverboard, check the webhook delivery log in the Stripe Dashboard before touching the database.
- **There is no self-serve plan change yet.** `/settings/billing/change-plan` is a stub that points users at email. To upgrade or downgrade, contact support — Stripe handles the proration on the next invoice.
- **One subscription per organisation** — there's no concept of add-on subscriptions today.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Your trial has ended" lock screen | No card was added before day 14, or the card was declined | Add or update a card from **Settings → Billing → Add payment method** (still reachable from the lock screen) |
| Payment succeeded in Stripe but the app still shows the old plan | Webhook delivery failed | Replay the latest `customer.subscription.updated` from Stripe Dashboard → Webhooks → Events |
| Need to extend a trial | Only via Stripe Dashboard | Update `trial_end` on the subscription; the webhook syncs `trialEndsAt` and clears any lock state |
| Refund needed | Not stored in Coverboard's DB | Refund in the Stripe Dashboard — invoices are read live from Stripe |

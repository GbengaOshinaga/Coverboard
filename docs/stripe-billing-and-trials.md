<!-- Last updated: 2026-10-11 — checked against src/lib/plans.ts, src/config/pricing.ts and the Stripe webhook -->
# Stripe billing and trial management

Coverboard bills monthly in GBP through Stripe. You can start on the Free plan, or start a 14-day free trial of a paid plan without a card. When a trial ends, Stripe either charges your card (if you've added one) or pauses the account until you add one.

This page covers what admins need to know day to day.

---

## The five plans

| Plan | Monthly | People | Admins |
|---|---|---|---|
| Free | £0 | Up to 5 | 1 |
| Starter | £19 | Up to 15 | 2 |
| Growth | £49 | Up to 75 | 5 |
| Scale | £99 | Unlimited | Unlimited |
| Pro | £179 | Unlimited | Unlimited |

All plans are billed **monthly only**; there's no annual billing. VAT is added on top through Stripe Tax.

**"People"** means everyone still on the team, admins included. Leavers stop counting once they've been marked as left. The limits are set in `src/lib/plans.ts` and checked by the server, not just the screen. What each plan includes is on the [pricing page](https://coverboard.io/pricing); the checks in the app are in `src/lib/planFeatures.ts`.

During a **trial** you get every feature, but the people and admin limits of the plan you chose already apply (see [Plan limits](#plan-limits)), because that's the plan the trial turns into.

---

## Signup and trial

There's no card at signup.

- **Free** — the team starts on Free straight away. There's no trial and no Stripe subscription.
- **A paid plan** — the team starts on a 14-day trial of that plan. Coverboard creates a Stripe customer and a trialing subscription. If Stripe can't be reached, you still get your account and can add a card later. The subscription is set to **pause**, not retry, if the trial ends without a card.

During a trial, admins see a banner on every page. Its colour changes as the deadline gets closer:
- **Blue** — more than 3 days left
- **Amber** — 2 to 3 days left
- **Red** — final day

The banner goes once a card is added. Three days before the trial ends, admins get a reminder email.

---

## Plan limits

Limits are checked whenever the team would grow:
- adding someone, or importing a CSV;
- inviting people during onboarding;
- making someone an admin;
- bringing someone back who'd left.

If the change would take you over, it's refused with a message saying why.

During a trial, or while a move to Free is pending, the limits are those of the plan you're moving to. That way the team can't grow past it before the switch.

Moving to a plan the team doesn't fit is refused too, for example 90 people choosing Growth. Mark people who've left, or change admins to managers, first.

A team can still end up bigger than its plan, for example if it grew before these checks existed. If so:
- **During a trial**, admins see a banner saying the plan they've chosen is too small. Three days before the end, every admin gets an email instead of the usual reminder.
- **Once paying**, admins are held at **Settings → Billing** until the team fits. Team, Requests, My time off, Help and their profile still work, so they can record leavers and approve leave. Staff and managers aren't affected. The hold lifts as soon as the team fits, after an upgrade or after marking leavers. Every admin is emailed when the team first starts paying for a plan it has outgrown.

---

## Adding a card

**Settings → Billing → Add payment method.**

The form uses Stripe Elements, so your card details never touch Coverboard's servers. We create a `SetupIntent`, Stripe handles the card in the browser, and the card is set as the subscription's default. Only cards are accepted (no BACS or SEPA).

**Declined cards:**
- `card_declined` → "Your card was declined. Please try a different card."
- Other errors → Stripe's message, or a general one if Stripe gives none.

---

## Changing plan

**Settings → Billing → Change plan.**

- **On a paid plan** — the change takes effect straight away, and Stripe adds the prorated difference to the next invoice. During a trial it sets the plan the trial turns into.
- **On Free** — choosing a plan takes you to Add payment method with that plan selected. Moving up from Free starts paying straight away; there's no second trial.
- **Back to Free** — **Switch to Free** stops the subscription at the end of the period you've paid for. You keep your paid features until then, and then move to Free instead of being locked. You can undo it with **Reactivate** before then. The team must fit Free's limits (5 people, 1 admin).

---

## What happens at trial end

**With a card on file** — Stripe charges on day 14. The plan becomes the one you chose, and the admin gets a welcome email.

**Without a card** — Stripe pauses the subscription and the team is **locked**: everyone sees the lock screen. Admins are emailed a link to reactivate. From the lock screen they can still reach **Settings → Billing → Add payment method**. If nobody adds a card, the account goes into the [30-day data deletion grace period](data-deletion-and-trial-expiry.md).

While a team is locked, Slack's buttons and commands are paused, and reply that an admin needs to choose a plan.

---

## Cancellation

Cancelling always takes effect **at period end**: you keep access until the next billing date.

**Settings → Billing → Cancel subscription** opens a confirmation showing the date you'll lose access. Once confirmed, Stripe is told to cancel at period end, and the billing page shows an amber banner with a **Reactivate** button.

If you change your mind before the period ends, click **Reactivate**. If you let it run out, the team is locked and goes into the [30-day data deletion grace period](data-deletion-and-trial-expiry.md). To keep using Coverboard for free instead, use **Switch to Free** rather than Cancel.

---

## Billing emails

All billing emails are sent from `src/lib/billing-emails.ts`.

| Email | When | Who gets it |
|---|---|---|
| Trial ending soon | 3 days before a trial ends | The billing contact |
| Plan too small | Instead of the trial reminder when the team has outgrown the chosen plan, and when a team starts paying for a plan it has outgrown | Every admin who isn't leaving |
| Welcome | The team's first payment, whether from a trial, from Free or reactivating a locked team. Sent once; not again after a failed payment is recovered | The billing contact |
| Payment failed | A payment fails | The billing contact |
| Account paused, subscription cancelled, deletion scheduled or cancelled | As named | The billing contact |

The **billing contact** is the longest-serving admin who isn't leaving. If every admin has a leaving date, it falls back to one of them.

---

## Invoices and receipts

The billing page shows your last 5 invoices, each with a link to its PDF on Stripe. Stripe holds the full invoice history; if you need an older invoice, ask support.

---

## Operational notes

- **Stripe's webhook decides subscription state.** Each Stripe event is handled once: the webhook records the event's ID, so a repeat delivery is skipped and doesn't send emails twice. If Stripe and Coverboard disagree, check the webhook delivery log in the Stripe Dashboard before touching the database.
- **A failed handler isn't retried.** The webhook replies OK even when a handler fails, so Stripe doesn't resend. The error is logged.
- **Email needs `RESEND_API_KEY`.** Without it, emails are written to the server log and everything else carries on.
- **One subscription per team.** There are no add-on subscriptions.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Lock screen saying "Your trial has ended" | No card was added before day 14, or the card was declined | Add or update a card from **Settings → Billing → Add payment method** (still reachable from the lock screen) |
| An admin keeps landing on Billing | The team is bigger than the plan it pays for (see the banner) | Choose a bigger plan, mark people who've left, or change admins to managers |
| "You can invite N now" during onboarding | Invites would take the team over its plan | Invite fewer people now, and the rest from the Team page after choosing a bigger plan |
| Payment went through in Stripe but the app shows the old plan | Webhook delivery failed | Resend the latest `customer.subscription.updated` from Stripe Dashboard → Webhooks → Events |
| Need to extend a trial | Only possible in the Stripe Dashboard | Change `trial_end` on the subscription; the webhook updates `trialEndsAt` |
| Refund needed | Refunds aren't stored in Coverboard | Refund in the Stripe Dashboard; invoices are read live from Stripe |

<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# Data deletion and trial expiry flow

Coverboard never deletes your data the moment you close your account or run out of trial. Every deletion goes through a 30-day grace period, with audit-logged checkpoints along the way and an admin email at every step. This page explains how the flow works — what triggers it, how to back out, and what actually gets removed at the end.

---

## What can trigger deletion

There are four scenarios where your organisation enters the deletion pipeline:

1. **You asked us to delete it.** An admin clicked **Delete account and all data** under **Settings → Danger zone** (also reachable from **Settings → Billing**).
2. **Your trial ended without a card.** Stripe paused your subscription and we started the trial-expired grace clock.
3. **Your subscription was cancelled.** Either you scheduled a cancel-at-period-end and it ran its course, or Stripe sent us a `customer.subscription.deleted` webhook.
4. **Payments kept failing.** After Stripe retries are exhausted, the org enters the same grace flow.

Whichever path triggers it, the org row is updated with `deletionRequestedAt`, `deletionScheduledFor` (now + 30 days), and `deletionReason`. A `DataDeletionAudit` row with event `scheduled` is written, and the admin gets an email confirming the date.

---

## The 30-day grace period

Once scheduled, your account is in a 30-day window where:

- The lock screen takes over for billing-triggered cases — only `/settings/billing/**`, `/settings/profile/**`, `/api/billing/**`, `/api/auth/**`, `/login`, `/signup`, `/logout` and `/locked` are reachable
- For user-requested deletions, the rest of the app continues to work until the scheduled date
- All data is still on disk, untouched
- The admin can cancel deletion (see below) and pick up where they left off

For trial-expired cases the flow has two stages: first a `trialExpiredGraceEndsAt` is set 30 days out (`trial_grace_started` audit). When that date passes, a daily cron promotes the org to a full `scheduled` deletion (a second 30-day window). In effect, trial users get up to 60 days from trial end before any data is touched.

---

## Cancelling a scheduled deletion

For billing-triggered cases the easiest cancel is to **add a card and pay an invoice** (for paused/cancelled trials) or **reactivate the subscription** (for cancel-at-period-end). The Stripe webhook clears `deletionScheduledFor` and writes an audit entry.

For user-requested deletions the admin needs to contact support to call the cancel endpoint — there is no in-app "undo" button by design (the Danger Zone exists to make deletion intentional, not casual).

---

## What runs at the end

A daily cron at `/api/cron/process-deletions` (scheduled via `vercel.json` to run at 02:00 UTC) does two things:

1. **Promote** any org whose `trialExpiredGraceEndsAt` has elapsed but isn't yet scheduled — they enter their second 30-day window
2. **Execute** any org whose `deletionScheduledFor` is in the past

Execution runs in a single database transaction with a 60-second timeout and removes:

- All leave requests, weekly earnings, weekly hours, and carry-over balances for users in the org
- All password reset tokens and Jira user mappings
- The Jira integration, bank holidays, public holidays, leave types, and audit logs for the org
- All users in the org

The organisation row itself is **not** deleted — it is anonymised to a stub (name set to `[deleted organization]`, slug rewritten, all Stripe IDs cleared, plan set to `LOCKED`, `deletionConfirmedAt` set). This stub stays so foreign key references survive and so you can see in the `DataDeletionAudit` table that a deletion happened.

A final `executed` audit entry is written and the original admin gets an "account deleted" email.

If anything fails mid-transaction, a `failed` audit entry is recorded with the error message and the deletion is retried on the next cron run.

---

## What you actually lose

After execution, none of your team's personal data, leave history, sickness notes, weekly earnings, or audit logs are recoverable. The stub organisation row keeps a paper trail (in `DataDeletionAudit`) of what happened and when, and that's it.

If you need a copy of any data before deletion runs, export it during the grace period — most reports support CSV export from **Reports**, and admins can pull the audit log from **/audit** or `GET /api/audit-logs`.

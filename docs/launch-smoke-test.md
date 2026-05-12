<!-- Last reviewed: 2026-05-11 -->
# Launch smoke-test runbook

A manual end-to-end check covering the critical revenue and lifecycle paths. Run this against **staging** (not production) before shipping any release that touches signup, billing, leave or deletion. Unit tests don't substitute for this — too much of the value is in the cross-system contracts (Stripe ↔ DB, app ↔ email, cron ↔ destructive actions).

**Time budget:** ~45 minutes if everything passes, longer when something fails (which is the point — better here than after launch).

---

## Preconditions

Before starting, confirm:

- [ ] Staging is pointed at **Stripe test mode** keys (`STRIPE_SECRET_KEY` starting `sk_test_…`).
- [ ] `STRIPE_WEBHOOK_SECRET` is set and matches the active staging webhook endpoint.
- [ ] `CRON_SECRET` is set (the cron routes now refuse to run in production without it — staging should match).
- [ ] `RESEND_API_KEY` (or whichever email provider) is set so you can confirm emails were sent. If staging swallows emails, use the provider's "sent" log instead.
- [ ] Stripe CLI is installed locally so you can `stripe trigger` events if a webhook gets stuck.
- [ ] You have a clean throwaway email alias for the test admin (e.g. `coverboard-smoke-YYYYMMDD@yourdomain`).

Open these in tabs alongside the staging app:

- Stripe Dashboard (test mode) → Customers, Subscriptions, Webhooks
- Database tool (Prisma Studio, or psql / a query GUI)
- Your email inbox for the throwaway alias

---

## Test data setup

You'll need one admin and one member. The admin is created by signup; the member is invited from the admin dashboard.

- Admin email: `coverboard-smoke-YYYYMMDD@…`
- Member email: `coverboard-smoke-YYYYMMDD+member@…`
- Org name: `Smoke Test YYYY-MM-DD` (the date makes orphaned orgs easy to clean up later)

---

## 1. Signup → trial

**Do:**
1. From an incognito window, open the staging signup page.
2. Fill in admin name, org name, email, password. Submit.

**Verify (UI):**
- [ ] Redirected to dashboard.
- [ ] Trial banner is visible with "14 days left" (or `daysLeft = 14`, `tone: "info"`).

**Verify (DB — `Organization` row for the new org):**
- [ ] `plan = "TRIAL"`
- [ ] `subscriptionStatus = "trialing"`
- [ ] `trialEndsAt` is roughly now + 14 days
- [ ] `stripeCustomerId` is set
- [ ] `stripeSubscriptionId` is set
- [ ] `stripePriceId` is one of the four configured price IDs (defaults to Growth)
- [ ] `cardAdded = false`

**Verify (Stripe Dashboard):**
- [ ] Customer exists with the admin email.
- [ ] Subscription exists with `status = trialing`, trial end ~14 days out, no default payment method.

**Verify (email):**
- [ ] Welcome email received (if signup sends one).

---

## 2. Invite a member

**Do:**
1. Navigate to **Team → Add member**.
2. Invite the `+member` email as a `MEMBER` role employee.
3. From the invite email (or by setting their password directly in staging), sign in as the member in a second incognito window.

**Verify (DB):**
- [ ] New `User` row with `organizationId` matching the test org, `role = "MEMBER"`.
- [ ] `AuditLog` entry `team_member.created`.

---

## 3. Add card

**Do:**
1. As the admin, go to **Settings → Billing → Add payment details**.
2. Enter Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
3. Submit.

**Verify (UI):**
- [ ] Redirect back to billing page with "Card added" toast.
- [ ] No "Add payment details" CTA on the billing page anymore.

**Verify (DB):**
- [ ] `Organization.cardAdded = true`.

**Verify (Stripe Dashboard):**
- [ ] Customer's default payment method is the test card.
- [ ] Subscription `default_payment_method` is set.

---

## 4. Request leave (member)

**Do:**
1. As the member, navigate to **Request leave**.
2. Pick a regular Annual Leave type, 3 working days starting next Monday, add a non-medical note.
3. Submit.

**Verify (UI):**
- [ ] Confirmation shown.
- [ ] The request appears in the member's "My leave" with `PENDING` status.

**Verify (DB — `LeaveRequest`):**
- [ ] Row created with `status = "PENDING"`, `userId` = member's id, correct dates and leave type.
- [ ] `AuditLog` entry `leave_request.created` with the member as actor.

**Verify (email):**
- [ ] Admin received "New leave request" notification.

---

## 5. Approve

**Do:**
1. As the admin, open the pending request from the dashboard.
2. Click **Approve**.

**Verify (UI):**
- [ ] Request now shows `APPROVED`, with reviewer's name.

**Verify (DB):**
- [ ] `LeaveRequest.status = "APPROVED"`, `reviewedById` = admin's id, `reviewedAt` set.
- [ ] `AuditLog` entry `leave_request.approved`.

**Verify (email):**
- [ ] Member received approval notification.

---

## 6. SSP cap

This step needs an SSP leave large enough to trip the 28-week cap. The easiest path: submit a long sickness leave for the member that exceeds `28 × qualifyingDaysPerWeek` days.

**Preflight:**
- Confirm the member's `qualifyingDaysPerWeek = 5` (default) and `averageWeeklyEarnings` is set above the LEL (£125+). If it's null, the SSP eligibility check will return `Below Lower Earnings Limit` and you won't see the cap path.
- Pick start/end dates that span ~30 working weeks (e.g. start = today, end = today + 210 days). For a 5-day qualifying week, anything over 140 payable working days will reach the cap.

**Do:**
1. As the member, submit a `Statutory Sick Pay` leave for the long range. Add a sickness note (this exercises the read-audit path in step 11 too).
2. Capture the `sspInfo` block in the API response (visible in the browser network panel, or via `curl`).

**Verify (response body):**
- [ ] `sspInfo.eligible = true`
- [ ] `sspInfo.limitReached = true`
- [ ] `sspInfo.payableDays` ≤ `28 × qualifyingDaysPerWeek`
- [ ] `sspInfo.remainingDaysAfter = 0`

**Verify (DB — the new `LeaveRequest`):**
- [ ] `sspDaysPaid` matches the capped figure (≤ 140 for a 5-day week).
- [ ] `sspLimitReached = true`.
- [ ] `AuditLog` has `leave_request.created` AND `leave_request.ssp_cap_reached` for this request.

**Verify (email):**
- [ ] Admin received "[Member name] has reached the 28-week SSP limit" email.

---

## 7. Change plan (new flow shipped in this iteration)

**Do:**
1. As the admin, go to **Settings → Billing → Change plan**.
2. Confirm the 4-plan grid loads with the current plan badged.
3. Click **Switch to Scale** (or whichever plan ≠ current). Read the confirmation dialog text.
4. Confirm.

**Verify (UI):**
- [ ] Toast: "Switched to Scale".
- [ ] Redirected to billing page; current plan shows "Scale".

**Verify (DB):**
- [ ] `Organization.stripePriceId` is now the Scale price id.
- [ ] If org is still trialing, `plan` may stay `TRIAL` until the next invoice converts — that's correct.

**Verify (Stripe Dashboard):**
- [ ] Subscription's price item changed.
- [ ] Upcoming invoice (Subscriptions → next invoice) shows proration.

---

## 8. SAR export (new flow shipped in this iteration)

**Do:**
1. Open the member's profile from **Team → [member]**.
2. Click **Export data (SAR)** (admin-only button).
3. Save the downloaded JSON file.

**Verify (file contents):**
- [ ] `exportVersion`, `exportedAt`, `exportedBy.email` set.
- [ ] `subject` block has the member's profile fields.
- [ ] `subject.passwordHash` is **absent** (redaction check).
- [ ] `leaveRequests` includes the request from step 4 and the SSP request from step 6.
- [ ] `passwordResetTokens[].token` is **absent** (only metadata + the redaction note).
- [ ] `auditLogActivity` is non-empty.

**Verify (DB):**
- [ ] New `AuditLog` entry `data_export.sar` with the admin as actor and the member as `resourceId`.

---

## 9. Read-side audit (new on Pro — your test org should be on a Pro plan or still trialing for this to surface)

**Do:**
1. As the admin, open the member's profile page.
2. Open the dashboard so the leave-requests list fires (the member's sickness leave from step 6 should be in the result set).
3. Open **/audit** (audit log viewer).
4. Open **/reports/uk-compliance**.

**Verify (DB — `AuditLog` for the test org):**
- [ ] `team_member.viewed` entry (resourceId = member id).
- [ ] `leave_request.sickness_viewed` entry (metadata includes the sickness-bearing leave ids).
- [ ] `audit_log.viewed` entry (this is the self-referential one; filters captured in metadata).
- [ ] `compliance_report.viewed` entry with `metadata.report = "uk-compliance"`.

If the org isn't on Pro (or trialing), these should **not** appear — read-audit is plan-gated.

---

## 10. Cancel subscription

**Do:**
1. **Settings → Billing → Cancel subscription**.
2. Read the confirmation dialog (should say "your access will continue until [period end]…").
3. Confirm.

**Verify (UI):**
- [ ] Amber banner: "Your plan will cancel on [date]. You can reactivate any time before then."
- [ ] Toast: "Cancellation scheduled".

**Verify (DB):**
- [ ] `Organization.cancelAtPeriodEnd = true`.

**Verify (Stripe):**
- [ ] Subscription has `cancel_at_period_end = true`, `cancel_at` populated.

---

## 11. Reactivate

**Do:**
1. Click **Reactivate** in the amber banner.

**Verify:**
- [ ] Banner disappears; toast "Plan reactivated".
- [ ] DB: `Organization.cancelAtPeriodEnd = false`.
- [ ] Stripe: subscription `cancel_at_period_end = false`.

---

## 12. Delete account

**Do:**
1. **Settings → Danger zone → Delete account**.
2. Confirm (whatever the explicit confirmation step is in the UI — typing the org name etc.).

**Verify (UI):**
- [ ] Red banner: "Your account is scheduled for permanent deletion on [date]. After that date, all team data, leave records, and billing history are irrecoverably deleted."

**Verify (DB):**
- [ ] `Organization.deletionScheduledFor` is set to ~30 days from now.
- [ ] `Organization.plan = "LOCKED"`.
- [ ] `DataDeletionAudit` row with `event = "scheduled"`.

**Verify (email):**
- [ ] Admin received "deletion scheduled" email.

**Verify (middleware lock):**
- [ ] Reload any dashboard page — should redirect to **/locked**.

---

## 13. Cron-driven deletion (only on staging, never against production data you care about)

The deletion cron runs daily at 02:00 UTC. To test it now without waiting, you have two options:

**Option A — manually invoke with the secret:**
```
curl -X POST https://staging.yourapp/api/cron/process-deletions \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Option B — temporarily set `deletionScheduledFor` to a past date in the DB**, then run the cron the same way.

**Verify:**
- [ ] Response shows `processed: 1, succeeded: 1, failed: 0` (or higher counts if other test orgs are also due).
- [ ] DB: the org's name is now `[deleted organization]`, `deletionConfirmedAt` is set, all `User`/`LeaveRequest`/`AuditLog` rows for that org are gone.
- [ ] `DataDeletionAudit` row with `event = "executed"`.
- [ ] Admin received "your data has been deleted" email.

**Also verify cron auth (the bug fix from item #5):**
- [ ] Without the `Authorization` header in staging, the same request returns 401 (because `CRON_SECRET` is set in staging).
- [ ] In a hypothetical no-secret production environment, the route would return 500 with `Cron not configured`. You can simulate this by temporarily clearing the env var on staging — restore it after.

---

## Pass criteria

A smoke pass is **green** when every checkbox above is ticked **and** none of the verification steps surfaced unexpected log lines / DB state. Specifically watch for:

- Stripe webhook `200`s for every subscription state change in steps 3, 7, 10, 11. A `400` (signature) or `500` (handler error) means an integration regression — go look at the server logs.
- No `[ERROR]` lines in the app logs during this run that aren't expected (e.g. SMP backfill failure when no earnings exist — that one is non-fatal).
- The audit log on Pro should show **both** the writes (step 5's approve, step 7's plan change is implicit, step 10's cancel etc.) **and** the four reads from step 9.

## Cleanup

When the run is done, run the cron in step 13 against the throwaway org to purge its data, then revoke the throwaway email if it lives in a real inbox.

If anything failed, capture the failing step number, the response body, the DB state, and the Stripe webhook event id (under Webhooks → recent events). Those four facts are usually enough to debug from.

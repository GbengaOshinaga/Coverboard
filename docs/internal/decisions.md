<!-- Internal engineering note — NOT published to the GitBook help centre. -->
# Decision log

_Last updated: 2026-10-12_

Why Coverboard works the way it does. The [feature guide](../guide/) says **what** the app does; this page says **why**, so nobody undoes a decision without knowing what it protects against. Many of these came from tester findings, and several were got wrong at least once before.

Each entry has:
- **Decision** — what we chose.
- **Why** — the reason.
- **Protects against** — what breaks if it's undone.
- **Where** — where it lives in the code.

If you change one, update its entry and add the date. If you make a new decision that someone could reasonably undo by accident, add it here.

---

## Product and scope

### 1. A leave and cover layer next to the rota, not a rota (2026-10-08)
- **Decision:** Coverboard handles leave, cover and statutory pay alongside whatever rota a team already uses. No rota builder. Shift CSV import comes before live rota integrations, and payroll export formats come before live payroll connections.
- **Why:** the target customers are UK shift teams, care homes first. They already have a rota tool. Competing with it would be a large build with no edge.
- **Protects against:** scope creep into scheduling.
- **Where:** `docs/internal/shift-cover-design.md`.

### 2. Cut promises we can't keep rather than build them speculatively (2026-06)
- **Decision:** if the pricing page claims a feature that isn't built and nobody is asking for it, remove the claim. Prefer showing something that already exists over building something new. Cut so far:
  - API access and data-residency settings on Pro;
  - the onboarding call;
  - turnover reporting.
- **Why:** it's a one-person team. Every claim has to be deliverable and maintainable.
- **Protects against:** selling features that don't exist.
- **Where:** `src/config/pricing.ts` (marketing copy) against `src/lib/planFeatures.ts` (what the code actually checks).

### 3. Cover assumes the same pattern every week
- **Decision:** shift cover uses fixed weekly working patterns.
- **Why:** it fits care homes with set shifts. A rota that changes every week would need a real rota feature, which we've decided not to build (1).
- **Protects against:** cover warnings that look precise but are wrong for teams whose rota changes weekly. This is listed in the guide's Known limitations.
- **Where:** `src/lib/regionCover.ts`, `WorkPattern` in the schema.

### 4. UK statutory rules only
- **Decision:** statutory pay and leave rules are UK only. Other countries get leave tracking without statutory calculations.
- **Why:** UK rules are what we can check against GOV.UK and legislation.gov.uk and keep current. The homepage dropped its strip of country flags for the same reason.
- **Protects against:** implying compliance we haven't verified.

---

## Permissions and privacy

### 5. Flat roles, with no manager-to-report hierarchy
- **Decision:** there are three roles: Admin, Manager and Member. Any manager can approve leave for anyone in the team.
- **Why:** launch customers are small, and usually the owner does everything. A hierarchy is a large change with no customer asking for it.
- **Protects against:** a half-built hierarchy. Note that a team can't currently stop one manager approving another's staff.
- **Where:** `docs/internal/leave-approval-and-visibility.md` has the full model, including the self-approval rule. You can't approve your own leave when another approver exists; a sole approver's request approves automatically and is labelled so.

### 6. Role, plan and sign-out are read from the database on every request (2026-10-09)
- **Decision:** the session callback (in `src/lib/auth.ts`) re-reads the user and team every time it runs, rather than trusting what was stored at login.
- **What it re-reads:**
  - the role and plan;
  - whether the person has been marked as left: if so, the session is revoked and middleware deletes the cookie;
  - for admins only, whether the team is over its plan's limit.
- **Why:** sessions last 30 days. Before this:
  - a demoted admin kept admin rights until their session expired, and could promote themselves back;
  - a leaver kept access the same way.
- **Protects against:** stale permissions.
- **Cost:** one lookup by ID per check, plus two counts for admins only.
- **Where:** the jwt callback in `src/lib/auth.ts`, and `src/middleware.ts`.

### 7. A team is never left without an admin (2026-10-09)
- **Decision:** demoting an admin, or giving one a leaving date, is refused if every other admin has left or has a leaving date of their own. The check runs inside the same transaction as the change.
- **How:** it's serialised with a Postgres advisory lock per team (`pg_advisory_xact_lock` on `admins:<orgId>`), not by locking the team's row.
- **Why the advisory lock:**
  - two admins demoting each other at the same moment would otherwise both succeed;
  - a row lock on the organisation would also be taken by anything that writes to the team's row or adds rows pointing at it, which risks deadlocks;
  - the advisory lock is only taken by this check.
- **Protects against:** a team nobody can administer, including through billing.
- **Where:** `src/lib/admin-continuity.ts`, called from the role change and `recordLeaving()`.

### 8. Staff see colleagues' leave as "Away" (2026-10-09)
- **Decision:** staff see every colleague's leave as "Away", in one neutral grey, with no type or note. Managers and admins see the type, and everyone sees their own. Sickness notes are visible only to the person and admins, not managers.
- **Why:**
  - sickness is health data, so it's special category under [UK GDPR Article 9](https://www.legislation.gov.uk/eur/2016/679/article/9);
  - staff don't need the reason a colleague is off, so showing it breaks data minimisation ([Article 5(1)(c)](https://www.legislation.gov.uk/eur/2016/679/article/5));
  - every type is hidden, not just sickness, because hiding only sickness would make "Away" mean "off sick";
  - the colour is neutral because colours give the type away.
- **Kept as is on 2026-10-09:** no team setting and no "visible to colleagues" switch per leave type. Revisit only if customers ask.
- **Protects against:** health data leaking to colleagues.
- **Where:** `src/lib/leave-privacy.ts` (the single rule), used by the dashboard, the overlap check, `regionCover.ts` cover checks and Slack. Staff's calendar only shows their own leave. Sickness-note redaction is in `src/app/api/leave-requests/`.

### 9. Slack channel posts never include the leave type or note
- **Why:** everyone in the channel can read them, whatever their role. This follows from 8.
- **Also:**
  - Slack is paused for locked teams;
  - people who've left can't act through it;
  - replies to button clicks go to Slack's `response_url`, because Slack ignores the body of the reply to a click.
- **Where:** `src/lib/slack.ts`, `src/app/api/slack/`.

### 10. Plan and role checks are in the APIs, not just on screen (2026-10-08 and 09)
- **Decision:** hiding a feature on screen isn't enough. The API also leaves out pay figures and right-to-work data for staff and for plans without those features. The overlap check returns names and dates, not whole leave records.
- **Why:** testers could read through the API what the page hid.
- **Where:** `src/lib/planFeatures.ts`, and the checks in each route.

---

## Plans and billing

### 11. Plan limits count people still on the team, admins included
- **Decision:** the people limit counts active users, admins included. Leavers stop counting once they're marked as left. The admin limit counts active admins.
- **Limits:**
  - Free: 5 people, 1 admin;
  - Starter: 15 people, 2 admins;
  - Growth: 75 people, 5 admins;
  - Scale and Pro: unlimited.
- **Why Growth is capped at 75 (2026-10-08):** so a large group can't get every statutory pay feature for £49. Groups go to Scale.
- **Where:** `src/lib/plans.ts` holds the numbers; `src/lib/plan-headcount.ts` the checks.

### 12. Limits apply as the plan a team is moving to (2026-10-09)
- **Decision:** during a trial, the limits are the plan the trial turns into. While a downgrade to Free is pending, they're Free's.
- **Why:**
  - the move happens in Stripe's webhook, after payment, and can't be refused there;
  - so a team mustn't be allowed to grow past the plan before the switch.
- **Where the limits are checked:**
  - adding people, CSV import and onboarding invites;
  - making someone an admin and bringing a leaver back;
  - every plan change.
- **Where:** `planForLimits()` in `src/lib/plan-headcount.ts`.

### 13. A team over its paid plan holds its admins at Billing, not its staff (2026-10-10)
- **Decision:** if a team is bigger than the plan it pays for, admins are redirected to Billing until it fits.
- **What still works for admins:** Team, Requests, My time off, Help, their profile, onboarding and the email links. Staff, managers and APIs aren't affected.
- **What admins see:**
  - a banner explaining why;
  - during a trial that has outgrown its chosen plan, the banner but no redirect.
- **Why:**
  - staff shouldn't lose access over a billing decision they can't make;
  - admins still need to approve leave and mark leavers to fix it;
  - blocking APIs would break work half-done.
- **Accepted trade-off:** the hold reads the session, which refreshes after a page loads, so an admin may see one page before being held. Closing that would mean repeating the check in the page layout.
- **Where:** `src/middleware.ts` (`ALLOWED_WHEN_OVER_PLAN`), `src/components/layout/plan-limit-banner.tsx`.

### 14. The webhook reads changes from the event, not from our stored status (2026-10-10)
- **Decision:** a change in subscription status, such as a trial ending, is detected from `event.data.previous_attributes`. Our database's stored status isn't used for this.
- **Why:**
  - Stripe doesn't guarantee the order events arrive in;
  - "payment succeeded" can arrive before "subscription updated";
  - comparing against our stored status therefore missed transitions, and with them the welcome and outgrown-plan emails.
- **Where:** `handleSubscriptionUpdated()` in `src/lib/stripe-webhook-handlers.ts`.

### 15. A £0 invoice changes nothing (2026-10-11)
- **Decision:** `invoice.payment_succeeded` with `amount_paid` of 0 is ignored. Stripe sends one when a trial starts.
- **Why:** treating it as a payment marked every new prod trial as an active, paying team with a card on file and its paid plan. That removed the trial banner, the card prompt and the trial features.
- **Repair:** `npm run resync:stripe-trials`. It only touches subscriptions Stripe has as trialing or paused, never payers.
- **Protects against:** wrong billing state.
- **Where:** `handleInvoicePaymentSucceeded()`, `scripts/resync-stripe-trials.ts`.

### 16. Emails that must go once are guarded in the database, not by event order (2026-10-10 and 12)
- **Decision:** each "only once" email has a database guard:
  - **Each Stripe event:** its ID is recorded in `StripeWebhookEvent` before it's handled, and a repeat delivery is skipped.
  - **The welcome email:** goes when `paidPlanStartedAt` is first set, by a conditional update. That happens on whichever arrives first, the first real payment or the subscription becoming active. It covers starting from a trial, from Free or from a locked team, and is never resent after a failed renewal recovers.
  - **Cancelling a scheduled deletion:** one conditional update. If two events race, only one cancels and sends "deletion cancelled".
- **Why:** Stripe retries events and sends related ones close together.
- **Accepted trade-off:**
  - each event is recorded before it's handled, so a handler that fails isn't redone;
  - this is fine while the webhook replies OK on errors;
  - if Stripe retries are ever enabled, remove the record when a handler fails.
- **Where:** `src/app/api/webhooks/stripe/route.ts` (`claimEvent`, `markPaidPlanStarted`), `src/lib/deletionScheduler.ts`.

### 17. Past due: the paid plan applies, unless the team was locked (2026-10-12)
- **Decision:** while Stripe retries a failed payment, the team has the plan it's paying for, and admins see a red banner.
- **Two cases:**
  - a trial whose first charge fails has still ended, so it moves to the plan it chose instead of keeping every feature;
  - a locked team that resubscribes straight into past due has paid nothing, so it stays locked until it does.
- **The payment-failed email** goes only from `invoice.payment_failed`, once per failed attempt. It used to come from the subscription update as well, which doubled it.
- **Where:** `handleSubscriptionUpdated()`, `src/components/layout/past-due-banner.tsx`.

### 18. A team that comes back cancels its deletion and its grace period (2026-10-12)
- **Decision:** when a subscription becomes active again:
  - any scheduled deletion is cancelled;
  - the 30-day grace date for a paused trial is cleared too, even if no deletion was scheduled yet.
- **Why:** the nightly job turns any expired grace date into a scheduled deletion, without checking the team's status. A team that came back during its grace period would have been deleted.
- **Safe for admin requests:** an admin's own deletion request cancels the subscription, so it can't be undone this way.
- **Where:** `cancelScheduledDeletion()`, `src/app/api/cron/process-deletions/route.ts`.

### 19. Switching to Free happens at period end, using Stripe metadata (2026-06-02)
- **Decision:**
  - "Switch to Free" cancels at period end with `metadata.downgrade_target = "free"`;
  - when the subscription ends, the webhook moves the team to Free instead of locking it and scheduling deletion;
  - Reactivate clears the flag.
- **Why:** the team has already paid for the period. Free is a different outcome from cancelling.
- **Where:** `src/app/api/billing/downgrade-to-free/route.ts`, `handleSubscriptionDeleted()`.

### 20. No second trial when upgrading from Free
- **Why:** they've already been using the product.
- **Where:** `src/app/api/billing/confirm-payment/route.ts`.

---

## Leave and statutory pay

### 21. One answer to "which days does this person work?" (2026-10-04)
- **Decision:** every calculation of pay or entitlement gets a person's working days from `getWorkingWeek()`, as they were on the date that matters. The two cases:
  - **A booking:** its own start date.
  - **Changing a child's details:** booked leave is rechecked against the pattern each booking was made with, not today's.
- **Why:** many calculations assumed Monday to Friday, which got part-time and shift workers wrong (holiday pay, SSP days, entitlement).
- **Where:** `src/lib/working-week-server.ts`.

### 22. How statutory pay dates and earnings are worked out (2026-10-06 and 07)
- **Earnings and service are tested at the HMRC week:**
  - for birth, the qualifying week, 15 weeks before the due week;
  - for adoption, the matching week;
  - HMRC weeks run Sunday to Saturday.
- **One calculation is shared by SPP, ShPP and neonatal pay:** the lower of the flat rate and 90% of average weekly earnings. It's `computeWeeklyParentPay()`.
- **The shared parental pay pool** is 39 weeks less the employee's own SMP or SAP weeks for that child, at least 2, or 37 if we don't hold those. The app can't see the other parent's claims.
- **Why:** each of these was wrong at least once, for example the old "due date minus 41 weeks" shortcut was a week too strict.
- **Rule:** reuse these helpers; don't add a calculation for each leave type.
- **Sources:**
  - [GOV.UK maternity technical guidance](https://www.gov.uk/government/publications/maternity-benefits-technical-guidance/maternity-benefits-technical-guidance);
  - [GOV.UK shared parental leave technical guide](https://www.gov.uk/government/publications/shared-parental-leave-and-pay-employers-technical-guide/shared-parental-leave-and-pay-employers-technical-guide-to-shared-parental-leave-and-pay-html-version).
- **Where:** `src/lib/smp-dates.ts`, `src/lib/smp-request.ts`.

### 22a. GOV.UK's calculators are the reference, and the rounding follows them (2026-10-12)
- **Decision:** our holiday, sick pay and family pay figures must match GOV.UK's own employer calculators. `src/lib/govuk-calculators.test.ts` holds cases run through them, each with a link that reproduces it. If one fails, fix the rule, not the figure.
- **What that changed:**
  - **Starters' holiday:** full entitlement × months of the leave year started ÷ 12, with the start month counting in full, rounded up to the next half day. This is [WTR reg. 15A](https://www.legislation.gov.uk/uksi/1998/1833/regulation/15A) and GOV.UK's guidance, section 3.2. We used the share of days left, which gave late-month starters less, for example 1 day instead of 2.5 for a 31 December start.
  - **Average weekly earnings** are never rounded to the penny. They're kept to 7 decimal places, as GOV.UK shows them, and the database columns were widened to match.
  - **SSP's 80% and SMP's 90%** are rounded up to the penny. We rounded both earnings and pay to the nearest penny, which could be 1p a week short.
- **Paternity:** GOV.UK's paternity calculator rounds to the nearest penny, not up. We round paternity, shared parental and neonatal pay up too, so we're at most 1p a week more than GOV.UK there, never less.
- **Not done yet:** irregular-hours accrual should be rounded per pay period ([reg. 15B(5)](https://www.legislation.gov.uk/uksi/1998/1833/regulation/15B)). The app doesn't know pay frequency, so this needs a setting first.
- **Where:** `prorateForStartDate()` in `src/lib/working-week.ts`, `roundUpToPenny()` in `src/lib/uk-compliance.ts`, `calculateAWE()` in `src/lib/smpCalculator.ts`.

### 23. Unpaid parental leave has its own year for each child
- **Decision:** the 4-week yearly limit runs in each child's own year. That year starts when the employee became entitled:
  - from 6 April 2026 it's a day-one right;
  - before that, it needed a year's service.
- **Booking rules:**
  - leave is booked in whole weeks, unless the child gets DLA, PIP or AFIP;
  - it's refused when the person has no working days.
- **Not modelled:** workforce or collective agreements that set a different scheme.
- **Source:** [Maternity and Parental Leave etc. Regulations 1999, Schedule 2](https://www.legislation.gov.uk/uksi/1999/3312/schedule/2).
- **Where:** `src/lib/unpaid-parental.ts`.

### 24. Leavers are marked as left, never deleted
- **Decision:** `leftOn` is their last day. A future date keeps them on the team until the nightly job marks them as left.
- **Why:**
  - holiday records must be kept for 6 years ([Employment Rights Act 2025](https://www.legislation.gov.uk/ukpga/2025/36/contents));
  - right-to-work records for 2 years after leaving;
  - holiday owed on leaving uses [WTR reg. 14](https://www.legislation.gov.uk/uksi/1998/1833/regulation/14).
- **Where:** `src/lib/leavers.ts`, `src/lib/former-staff-retention.ts`, `src/lib/holiday-on-leaving.ts`.

### 25. Fit notes: dates only
- **Decision:** we record when a fit note was received and the dates it covers. No upload and no medical details.
- **Why:** it keeps health data to the minimum (see 8). The employer's existing HR system holds the document.
- **Where:** `FitNote` in `prisma/schema.prisma`.

---

## Engineering conventions

### 26. Each rule lives in one place
- **Decision:** a rule lives in one helper, and every route, page and Slack handler calls it. Examples:
  - the working week (21);
  - leave privacy (8);
  - plan limits (11–12);
  - the last-admin check (7);
  - leave booking (`createLeaveRequest()`) and approving (`reviewLeaveRequest()`), shared by the web app and Slack.
- **Why:** copies drift apart. Several tester findings were one surface missing a rule that another applied.

### 27. The Stripe webhook takes its dependencies as a parameter
- **Decision:** handlers get their database and email functions through `WebhookDeps`, so tests can run every event in any order without Stripe or a database.
- **Where:** `src/lib/stripe-webhook-handlers.ts` and its `.test.ts`.

### 28. Hand-written migrations are checked without a shadow database
- **Never** pass a real database as `--shadow-database-url`. Prisma resets the shadow database, and that wiped the local one on 2026-10-10.
- **Instead,** check drift with:
  - `prisma migrate status`; or
  - `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma`.

### 29. The two sets of docs
- **Help pages in `docs/*.md`:** for customers. Rewrite them when something they describe changes.
- **The feature guide in `docs/guide/`:** for us. Add changes as a dated updates block in `content.py`, not by rewriting entries. Then run:
  - `check.py --links` first, which fails on a missing code path or broken legal link;
  - then rebuild the PDF.
- **This decision log:** for the reasons behind decisions.

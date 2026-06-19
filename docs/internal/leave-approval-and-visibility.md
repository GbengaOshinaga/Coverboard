<!-- Internal engineering/ops note — NOT published to the GitBook help centre. -->
# Leave approval & sickness-note visibility — model and decisions

_Last updated: 2026-06-20_

## Current model (flat roles)

Roles are flat and org-scoped: `ADMIN`, `MANAGER`, `MEMBER`. **There is no
manager→report relationship** in the schema (no `managerId`/`reportsTo`). So:

- **Approval:** any `ADMIN` or `MANAGER` can approve/reject any request **in the
  same org**. There is no check that the approver actually manages the
  requester. Org scoping is enforced (a request id from another org returns
  404/"wrong org") — see decision 3 below.
- **Visibility:** `MEMBER`s see only their own requests; `ADMIN`/`MANAGER` see
  all requests in the org.

> **Entry points:** approval/creation can happen from **two surfaces** — the web
> app and **Slack** (interactive Approve/Reject buttons, and `/requestleave`).
> As of 2026-06-20 both surfaces run the **same shared cores**, so every rule
> below applies identically regardless of where the action originates. See
> decision 3.

## Decisions made 2026-06-18 (the "near-term slice")

We hardened the flat model rather than building the hierarchy, because at
launch the customers are small (owner-as-admin handles everything).

### 1. Self-approval guard
An admin/manager cannot approve/reject **their own** request when another
approver exists (returns 403). A **sole** admin/manager *can* self-approve, to
avoid deadlocking a solo owner. Rationale: segregation of duties.

The guard lives in the shared core **`src/lib/leave-requests/review.ts`**
(`reviewLeaveRequest`), so it applies to both the web PATCH and the Slack
approve/reject buttons. The mirror case at creation time — a sole admin's own
request is **auto-approved** rather than parked in PENDING with no one to action
it — lives in **`src/lib/leave-requests/create.ts`** (`createLeaveRequest`),
used by both the web POST and Slack `/requestleave`.

### 2. Sickness notes are admin-only (chose "Option A")
Sickness/fit-note free text (`LeaveRequest.sicknessNote`) is returned **only to
the request's owner and to `ADMIN`s** (the org's data controllers). It is
redacted (`sicknessNote: null`) for everyone else — including **managers**.
Managers still see leave type, dates, and the `evidenceProvided` flag.

Enforced at the two client-facing exposure points (both used Prisma `include`,
which returns all scalar fields):
- `src/app/api/leave-requests/route.ts` — GET list: redact then return
  `visibleRequests`. The read-side audit (`selectSicknessAuditMeta`) runs on the
  **redacted** set so managers don't generate spurious `sickness_viewed` entries.
- `src/app/api/leave-requests/[id]/route.ts` — PATCH response: redact `updated`
  for non-owner/non-admin actors. (Approve/reject now delegate to the review
  core and re-fetch the request before redacting; cancel/field edits redact in
  place. Redaction behaviour is unchanged.)

Verified safe / unchanged: `team-members/[id]/activity` uses `select: { id }`
(no note); SAR-export redaction in `src/lib/audit.ts` was already correct.

**Why:** ICO/UK-GDPR data minimisation — health data restricted to those who
need it (HR/payroll = admin). Matches the guidance in `gdpr-leave-data.md`
("a line manager does not need to know why someone is off sick").

**Known cost (accepted):** an employee's *own* line manager also can't see the
note. Without a manager relationship we can't distinguish the legitimate
manager from unrelated ones, so we chose the privacy-safe end of an
all-or-nothing choice for the MANAGER role.

## Decisions made 2026-06-20 (web/Slack parity)

Slack had grown a **second, divergent** approval path: the interactive
Approve/Reject buttons and `/requestleave` did their own Prisma writes and
skipped audit logging, the self-approval guard, Bradford recompute, the
requester email, analytics, and (for `/requestleave`) all statutory validation
and solo-admin auto-approval. The fix was to remove the duplication, not to
patch Slack a third time.

### 3. Shared cores for create + review
- **`src/lib/leave-requests/create.ts`** (`createLeaveRequest`) — owns
  notice/evidence/SSP/SMP/paternity/UPL/holiday-pay logic, solo-admin
  auto-approval, notifications, audit, analytics. Called by the web `POST` and
  Slack `/requestleave`.
- **`src/lib/leave-requests/review.ts`** (`reviewLeaveRequest`) — owns the
  self-approval guard, **org scoping**, SMP backfill, Bradford recompute,
  notifications, audit, analytics. Called by the web `PATCH` (approve/reject
  branch) and the Slack interaction handler.

The web route keeps the surfaces the cores don't cover: `CANCELLED`, KIT-day /
evidence edits, and response redaction.

**IDOR fix (folded in):** the web `PATCH` previously loaded the request by id
without checking it belonged to the actor's org. Both cores (and the web
cancel/edit branch) now enforce org match. Slack already checked this.

**Why:** the headline Slack pitch is "everything in Slack appears identically in
the dashboard — one source of truth." That was only true once both surfaces ran
the same code, the audit log included Slack actions, and the segregation-of-
duties guard couldn't be bypassed via a button.

## Deferred follow-up — `managerId` reporting hierarchy ("Option B")

Build when a mid-size customer (≈50+ employees) needs proper line-manager
scoping. It unlocks the correct middle ground:

- Add optional `User.managerId` (nullable self-relation).
- **Approval routing:** request routes to the employee's manager; falls back to
  any admin when unset; admins can always override so nothing gets stuck.
- **Visibility:** managers see their direct reports' requests (incl. sick note);
  admins see all; members see their own. → sick-note visibility becomes
  **owner + that employee's manager + admins**, restoring the return-to-work
  case without re-exposing notes to unrelated managers.
- Needs an assign-manager UI + notification routing.

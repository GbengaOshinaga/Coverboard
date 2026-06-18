<!-- Internal engineering/ops note — NOT published to the GitBook help centre. -->
# Leave approval & sickness-note visibility — model and decisions

_Last updated: 2026-06-18_

## Current model (flat roles)

Roles are flat and org-scoped: `ADMIN`, `MANAGER`, `MEMBER`. **There is no
manager→report relationship** in the schema (no `managerId`/`reportsTo`). So:

- **Approval:** any `ADMIN` or `MANAGER` can approve/reject any request in the
  org. There is no check that the approver actually manages the requester.
- **Visibility:** `MEMBER`s see only their own requests; `ADMIN`/`MANAGER` see
  all requests in the org.

## Decisions made 2026-06-18 (the "near-term slice")

We hardened the flat model rather than building the hierarchy, because at
launch the customers are small (owner-as-admin handles everything).

### 1. Self-approval guard
`src/app/api/leave-requests/[id]/route.ts` — an admin/manager cannot
approve/reject **their own** request when another approver exists (returns 403).
A **sole** admin/manager *can* self-approve, to avoid deadlocking a solo owner.
Rationale: segregation of duties.

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
  for non-owner/non-admin actors.

Verified safe / unchanged: `team-members/[id]/activity` uses `select: { id }`
(no note); SAR-export redaction in `src/lib/audit.ts` was already correct.

**Why:** ICO/UK-GDPR data minimisation — health data restricted to those who
need it (HR/payroll = admin). Matches the guidance in `gdpr-leave-data.md`
("a line manager does not need to know why someone is off sick").

**Known cost (accepted):** an employee's *own* line manager also can't see the
note. Without a manager relationship we can't distinguish the legitimate
manager from unrelated ones, so we chose the privacy-safe end of an
all-or-nothing choice for the MANAGER role.

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

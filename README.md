# Coverboard

Team leave management for small, distributed teams. See who's out, plan coverage, and manage leave in one place — with built-in support for country-specific policies, email notifications, a Slack bot, and Jira project coverage.

Built for teams of 5–15 people, especially those spread across the UK, Africa, LATAM, and SEA where public holidays and statutory leave rules vary wildly. Includes full UK statutory compliance — SSP, maternity, paternity, shared parental leave, regional bank holidays, pro-rata entitlements, and Bradford Factor reporting.

## Subscription plans

Each organization has a **`plan`** on the `Organization` model: `STARTER`, `GROWTH`, `SCALE`, or `PRO` (see `SubscriptionPlan` in `prisma/schema.prisma`). Tier logic lives in **`src/lib/plans.ts`** (support tiers, audit trail access, admin limits, etc.). Pricing copy for the landing page is in **`src/config/pricing.ts`**.

| Tier | Examples of what unlocks |
|------|---------------------------|
| **Starter** | Core product; up to 2 admins (unless `maxAdminUsers` is changed) |
| **Growth** | Unlimited admins; stronger UK reporting and compliance signals (see pricing config) |
| **Scale** | Priority support targets on **Help**; absence analytics; UK compliance report pack; year-end carry-over tooling |
| **Pro** | SLA-backed support; dedicated onboarding booking CTA; **audit trail** viewer and CSV export; custom leave policy editing in Settings |

The demo seed organization is set to **Scale** so plan-gated UI can be exercised without manual DB edits. Switch a org to **Pro** in the database (or seed) to try the audit trail at **`/audit`**.

External API keys for third-party access were **not** implemented; product tiers may still mention future API access in marketing copy.

## Features

### Dashboard — "Who's out today?"

A single view that answers the question every team asks every morning. Shows who's currently out, who's off this week, and your personal leave balance with visual progress bars.

### Team Calendar

Month-view calendar showing all team absences as color-coded bars alongside country-specific public holidays. See overlap at a glance.

### Leave Requests with Overlap Detection

Submit leave requests through the web UI or Slack. When selecting dates, the system automatically checks for team overlap and warns when coverage drops below 50%. Managers approve or reject with one click.

### Leave Balance Tracking

Country-aware balance engine. Each team member's allowance is determined by their country's leave policy (e.g., Nigeria: 20 days annual, Kenya: 21 days, Brazil: 30 days). Balances show used, pending, and remaining days with visual progress bars.

### Multi-Country Leave Policies

Define leave types (Annual, Sick, Parental, Compassionate) with per-country allowances via the `LeavePolicy` model. The seed includes policies for Nigeria, Kenya, Brazil, and South Africa.

**Admins** can create, edit inline, and delete **country policies** (allowance and carry-over cap per leave type and country) from **Settings**, and **edit or delete leave types** when no leave requests reference them. APIs: `GET`/`POST` `/api/leave-policies`, `PATCH`/`DELETE` `/api/leave-policies/[id]`, `PATCH`/`DELETE` `/api/leave-types/[id]`.

### Mixed Team Support

Handles employees, contractors, and freelancers in the same team. Member type is visible on all cards and request views so managers can account for different leave arrangements.

### Slack Bot

Three slash commands bring leave management into your team's Slack workspace:

| Command | Description |
|---------|-------------|
| `/whosout` | Shows who's out today and upcoming absences for the next 7 days |
| `/mybalance` | Shows your personal leave balance for each leave type |
| `/requestleave 2026-03-01 2026-03-05 Annual Taking a break` | Submit a leave request directly from Slack |

When a request is submitted (from Slack or the web), a notification with **Approve / Reject** buttons is posted to the team channel. Managers can approve or reject directly in Slack. The requester receives a DM with the decision.

### Self-Serve Onboarding

New organizations go through a guided setup wizard: name the team, configure leave types, add country-specific public holidays, and invite team members — all before reaching the dashboard.

### Email Notifications

Powered by [Resend](https://resend.com). Sends emails for:

- **Team invites** — new members receive a welcome email with temporary credentials
- **Request submitted** — admins and managers are notified when someone requests leave
- **Request status** — the requester gets an email when their request is approved or rejected

### Password Reset

Token-based password reset flow. Users enter their email, receive a secure time-limited link, and set a new password. Tokens are single-use and expire after 1 hour.

### Profile & Account Settings

Users can update their display name, change their password, and manage email preferences (opt out of the weekly digest) from the profile settings page.

### Weekly Digest

Every Monday at 8 AM UTC, a cron job sends managers and admins a summary of who's out this week, who's out next week, and how many pending requests need attention. Users can opt out from their profile settings.

### Jira Project Coverage

Connect your Jira Cloud site via OAuth 2.0 to get project coverage warnings when someone goes on leave:

- **Coverage warnings** — when reviewing a leave request, managers see a list of open Jira issues assigned to the requester
- **Available teammates** — the system suggests teammates who are not on leave during the same period
- **One-click reassign** — managers can reassign issues to an available teammate directly from the leave review screen
- **Requester awareness** — when submitting a request, employees see an informational view of their open issues

Users are matched between Coverboard and Jira by email address, with mappings cached for performance.

### Public Holidays

Country-specific public holidays are stored per organization. They appear on the team calendar alongside leave. The seed includes holidays for Nigeria, Kenya, Brazil, and South Africa (2026).

### Reports, UK Compliance & Analytics

The **Reports** area (`/reports`) includes:

- **Analytics** — absence trends, leave-type and department breakdowns, top absence days (consumes `/api/reports/analytics`).
- **UK compliance** — Bradford Factor, right to work, holiday usage, SSP liability, parental leave with KIT day tracking; per-tab and full-pack **CSV export**.
- **Payroll export** — approved leave × **daily holiday pay rate** (see below) for any date range, with CSV export (`/api/reports/payroll`).
- **Year-end rollover** (admins) — preview and run UK annual carry-over into `LeaveCarryOverBalance` via `/api/carry-over/process` (supports `dryRun`).

UK-focused details are documented in **`UK_COMPLIANCE.md`**.

### UK Holiday Pay (52-week average)

Since the 2020 Working Time Regulations amendments (and Harpur Trust v Brazel), UK holiday pay must reflect **normal remuneration** — basic pay **plus** regular overtime, commission, and shift allowances — averaged over the last **52 paid weeks**. Zero-pay weeks are excluded.

- **Model**: `WeeklyEarning` — `userId`, `weekStartDate`, `grossEarnings` (DECIMAL), `hoursWorked`, `isZeroPayWeek`. Unique per `(userId, weekStartDate)`.
- **Calculator**: `src/lib/holidayPay.ts` — `calculateHolidayPayRate(weeks)` returns the **daily** rate (weekly average ÷ 5), `getDailyHolidayPayRateForUser(userId)` pulls from the DB.
- **Capture at booking**: when an annual-leave request is created, the daily rate is computed and stored on `LeaveRequest.dailyHolidayPayRate` so payroll has the legally correct figure at the moment the leave was booked.
- **Settings warning**: the Settings page lists employees with no earnings history and shows an amber warning that their holiday pay will fall back to basic salary only.
- **Earnings API**: `GET /api/weekly-earnings?userId=...`, `POST /api/weekly-earnings` (single row or `{ userId, entries: [...] }` batch), `GET /api/weekly-earnings/coverage`.
- **Tests**: `src/lib/holidayPay.test.ts` — zero-pay exclusion, fewer than 52 weeks, overtime inclusion, 52-week window cap, rounding. Run with `npm test`.

### UK Statutory Sick Pay (SSP)

SSP is gated on three HMRC rules that were previously approximated; the calculator in `src/lib/uk-compliance.ts` now enforces each one:

- **Qualifying-day daily rate** — `calculateSspDailyRate(qualifyingDaysPerWeek)` divides the weekly rate by the employee's contracted working days (`User.qualifyingDaysPerWeek`, default 5). A 3-day-a-week employee earns `123.25 / 3` per sick day — **not** `123.25 / 7`.
- **Lower Earnings Limit** — `calculateSspEntitlement` returns `{ eligible: false, reason: "Below Lower Earnings Limit" }` when `User.averageWeeklyEarnings < LEL_WEEKLY` (£123 for 2024/25, overridable via `LEL_WEEKLY` env).
- **28-week cumulative cap** — `LeaveRequest.sspDaysPaid` and `LeaveRequest.sspLimitReached` track the statutory 28-week ceiling per PIW (linked with a 56-day window). When the cap is first hit, org admins/managers get an email and an `leave_request.ssp_cap_reached` audit entry is written.

`POST /api/leave-requests` returns an `sspInfo` block with `eligible`, `reason`, `dailyRate`, `sspDaysPaidThisRequest`, `cumulativeSspDaysPaid`, `remainingDaysAfter`, and `limitReached`. Full details and test coverage in **`UK_COMPLIANCE.md`**.

### UK Statutory Maternity Pay (SMP) — phase tracking

SMP runs in two phases: **weeks 1–6 at 90% of Average Weekly Earnings**, then **weeks 7–39 at the lower of the flat rate (£194.32 for 2026/27) or 90% AWE**. Coverboard captures AWE and both phase rates when a maternity leave is booked so payroll has a legally correct weekly figure for every payslip:

- **Calculator**: `src/lib/smpCalculator.ts` — `calculateAWE`, `calculateSMPPhaseRates`, `calculateSMPPhaseDates`, `getCurrentSMPPhase`, `getAweForUser`.
- **Persisted on `LeaveRequest`**: `smpAverageWeeklyEarnings`, `smpPhase1EndDate`, `smpPhase2EndDate`, `smpPhase1WeeklyRate`, `smpPhase2WeeklyRate`.
- **UK compliance report** (`/api/reports/uk-compliance`): the **parental tracker** row now includes an `smp` object with the current phase label ("Phase 1 (90% AWE)" / "Phase 2 (flat rate)"), weekly rate, and both phase end dates.
- **Payroll export** (`/api/reports/payroll`): maternity rows include an `smp` block (AWE + current phase + current weekly rate + both phase rates) so the export CSV can drive payroll without manual lookups.
- **Env override**: `SMP_WEEKLY_RATE` or `SMP_FLAT_RATE` (same value, update each April).
- **Tests**: `src/lib/smpCalculator.test.ts` — AWE math, both phase-2 branches (low earner and high earner), phase date/rate edge cases.

### Help & Support

**`/help`** shows plan-appropriate contact options: standard email for Starter/Growth, priority targets for Scale, SLA-backed messaging for Pro. Optional public env vars (`NEXT_PUBLIC_SUPPORT_EMAIL`, etc.) override defaults — see **`.env.example`**.

### Audit trail (Pro)

**`/audit`** lists organization activity for **admins** on **Pro** plans. Entries are written through **`src/lib/audit.ts`** (`recordAudit`) from key API routes (leave requests, team members, leave types/policies, org settings, carry-over runs, onboarding completion). **`GET /api/audit-logs`** supports filters and cursor pagination; the page can **export CSV**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL + Prisma 6 |
| Auth | NextAuth.js 4 (Credentials + Google OAuth stub) |
| Styling | Tailwind CSS 3 |
| Validation | Zod |
| Icons | Lucide React |
| Dates | date-fns |
| Email | Resend |
| Slack | @slack/web-api |
| Jira | Atlassian OAuth 2.0 (3LO) + REST API v3 |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (local instance or hosted)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd coverboard
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coverboard?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-random-secret-here"
```

See **`.env.example`** for all optional variables (Resend, Slack, Jira, cron secret, UK statutory overrides, Help/Support and demo booking URLs).

### 3. Set up the database

```bash
npx prisma migrate dev   # Apply migrations (recommended when schema is versioned)
# or, for a quick local sync without migration files:
# npx prisma db push
npm run db:seed          # Seed demo data
```

After pulling changes that add models (e.g. `AuditLog`), run **`npx prisma generate`** and apply the latest migration (or `db push`) before starting the app.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo credentials

| Email | Password | Role |
|-------|----------|------|
| ade@acme.com | password123 | Admin |
| wanjiku@acme.com | password123 | Manager |
| chidi@acme.com | password123 | Member |
| fatima@acme.com | password123 | Contractor |
| pedro@acme.com | password123 | Freelancer |
| amina@acme.com | password123 | Member |

The seed creates an "Acme Global" organization (plan **Scale** in `prisma/seed.ts`) with 6 users across Nigeria, Kenya, and Brazil, leave types, country-specific policies, sample leave requests, and public holidays.

## Slack Bot Setup

The Slack bot is optional. The web app works fully without it.

### 1. Create a Slack App

Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app.

### 2. Configure bot token scopes

Under **OAuth & Permissions**, add these bot token scopes:

- `commands` — Register slash commands
- `chat:write` — Post messages and notifications
- `users:read` — Look up users
- `users:read.email` — Match Slack users to Coverboard accounts by email

### 3. Create slash commands

Under **Slash Commands**, create three commands:

| Command | Request URL |
|---------|------------|
| `/whosout` | `https://your-domain.com/api/slack/commands` |
| `/mybalance` | `https://your-domain.com/api/slack/commands` |
| `/requestleave` | `https://your-domain.com/api/slack/commands` |

All three point to the same URL — the handler routes by command name.

### 4. Enable interactivity

Under **Interactivity & Shortcuts**, enable interactivity and set:

- **Request URL:** `https://your-domain.com/api/slack/interactions`

This allows the Approve / Reject buttons on leave request notifications.

### 5. Install to workspace

Install the app to your Slack workspace and copy the **Bot User OAuth Token** and **Signing Secret**.

### 6. Add environment variables

```
SLACK_BOT_TOKEN="xoxb-your-bot-token"
SLACK_SIGNING_SECRET="your-signing-secret"
SLACK_NOTIFICATION_CHANNEL="#time-off"
```

The notification channel is where new leave request notifications (with approve/reject buttons) are posted. Defaults to `#time-off` if not set.

### How user matching works

The bot matches Slack users to Coverboard accounts by **email address**. When someone runs a slash command, the bot looks up their Slack profile email and finds the matching Coverboard user. Make sure team members use the same email in both systems.

## Jira Integration Setup

The Jira integration is optional. It adds project coverage warnings to the leave review workflow.

### 1. Create an OAuth 2.0 (3LO) app

Go to [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/) and create a new OAuth 2.0 (3LO) integration.

### 2. Configure scopes

Add the following scopes:

- `read:jira-work` — Search issues
- `write:jira-work` — Reassign issues
- `read:jira-user` — Look up users by email
- `read:me` — Read the connecting user's identity
- `offline_access` — Obtain a refresh token

### 3. Set the callback URL

Set the callback URL to:

```
https://your-domain.com/api/jira/callback
```

### 4. Add environment variables

```
JIRA_CLIENT_ID="your-client-id"
JIRA_CLIENT_SECRET="your-client-secret"
JIRA_REDIRECT_URI="https://your-domain.com/api/jira/callback"
```

### 5. Connect from Settings

An admin can then go to **Settings** in Coverboard and click **Connect Jira**. The OAuth flow handles the rest — tokens are stored per-organization and refreshed automatically.

### How user matching works

Coverboard matches users to Jira accounts by **email address**. On the first coverage check for a user, the system searches Jira for a matching email and caches the mapping. Make sure team members use the same email in both systems.

## Project Structure

```
src/
  app/
    (auth)/
      login/page.tsx              Login page
      register/page.tsx           Registration page
      forgot-password/page.tsx    Forgot password form
      reset-password/page.tsx     Reset password form (from email link)
    (dashboard)/
      layout.tsx                  Authenticated shell (sidebar + topbar)
      dashboard/page.tsx          "Who's out today?" + stats + balances
      calendar/page.tsx           Team calendar month view
      requests/
        page.tsx                  Leave requests list (filter, approve, reject)
        new/page.tsx              New leave request form
      team/page.tsx               Team members management
      reports/page.tsx            Analytics, UK compliance, year-end rollover, CSV exports
      audit/page.tsx              Audit log viewer + export (Pro)
      help/page.tsx               Plan-tiered support & resources
      settings/
        page.tsx                  Org settings, leave types, country policies, Slack/Jira
        profile/page.tsx          Profile, change password, email preferences
    api/
      auth/[...nextauth]/route.ts NextAuth handler
      auth/register/route.ts      Registration endpoint
      auth/forgot-password/       Password reset request
      auth/reset-password/        Password reset completion
      auth/change-password/       Authenticated password change
      auth/profile/               Profile read/update
      cron/weekly-digest/         Weekly digest email (cron-triggered)
      holidays/route.ts           Public holidays (by country/year)
      jira/
        connect/route.ts          Start Jira OAuth flow
        callback/route.ts         Jira OAuth callback
        status/route.ts           Jira connection status
        disconnect/route.ts       Remove Jira integration
        coverage/route.ts         Open issues + available teammates
        reassign/route.ts         One-click issue reassignment
      leave-balances/route.ts     Leave balance calculations
      weekly-hours/route.ts       Variable-hours history (UK pro-rata)
      leave-requests/route.ts     Leave request CRUD (list + create)
      leave-requests/[id]/route.ts  Approve/reject/cancel, KIT/evidence (managers)
      leave-types/route.ts        Leave type list + create
      leave-types/[id]/route.ts   Update/delete leave type (admin)
      leave-policies/route.ts     Country policies list + create
      leave-policies/[id]/route.ts  Update/delete country policy
      organization/settings/route.ts  Org + UK settings (includes plan)
      reports/uk-compliance/route.ts  UK compliance datasets
      reports/analytics/route.ts  Absence analytics
      carry-over/process/route.ts Year-end carry-over (admin)
      audit-logs/route.ts         Audit log listing (admin, Pro)
      onboarding/complete/        Onboarding wizard completion
      overlap/route.ts            Overlap detection for date ranges
      slack/commands/route.ts     Slash command handler
      slack/interactions/route.ts Button click handler (approve/reject)
      slack/status/route.ts       Connection status check
      team-members/route.ts       Team member CRUD
      team-members/[id]/route.ts  Update/delete team members
  components/
    ui/                           Reusable primitives (Button, Card, Badge, etc.)
    calendar/                     Month view + day cell components
    dashboard/                    Who's out, upcoming absences, leave balances
    landing/                      Landing page (navbar, hero, features, pricing tiers)
    layout/                       Sidebar + topbar
    leave/                        Request form, overlap, balance, coverage warning
    onboarding/                   Multi-step onboarding wizard
    team/                         Member card + form
  lib/
    auth.ts                       NextAuth configuration
    email.ts                      Resend client + sendEmail helper
    email-notifications.ts        High-level email dispatch functions
    email-templates.ts            HTML email templates
    jira.ts                       Jira OAuth token management, issue search, reassign
    leave-balances.ts             Balance calculation engine
    plans.ts                      Subscription plan helpers and feature gates
    audit.ts                      Audit log helper (`recordAudit`)
    csv-export.ts                 CSV helpers for reports and audit export
    prisma.ts                     Prisma client singleton
    slack.ts                      Slack client, request verification, user resolution
    slack-messages.ts             Block Kit message builders
    slack-notifications.ts        Notification dispatch (new request, status change)
    types.ts                      Shared TypeScript types
    utils.ts                      cn(), date helpers, country names
    validations.ts                Zod schemas
prisma/
  schema.prisma                   Database schema (see below)
  seed.ts                         Demo data seeder
UK_COMPLIANCE.md                  UK rules, reporting, carry-over notes
vercel.json                       Cron job configuration (weekly digest)
```

## Database Schema

**14 models** and **9 enums** (including `SubscriptionPlan`, `EmploymentType`, `LeaveCategory`, `BankHolidayRegion`, `DataResidency`). Key entities:

- **Organization** — Team/company; **`plan`** (subscription tier), UK settings, carry-over config, `maxAdminUsers`, data residency
- **User** — Role, member type, employment type, UK/compliance fields, weekly hours relation
- **LeaveType** — Leave categories with metadata (category, evidence, notice, etc.)
- **LeavePolicy** — Per-country allowance and carry-over caps for a leave type
- **LeaveRequest** — Workflow, evidence, KIT days for parental tracking
- **PublicHoliday** / **BankHoliday** — Generic country holidays vs UK regional bank holidays
- **UserWeeklyHours** — History for variable-hours pro-rata
- **LeaveCarryOverBalance** — Carried days per user, leave type, and leave year
- **WeeklyEarning** — Gross earnings per week for the 52-week UK holiday pay calculation
- **PasswordResetToken** — Forgot-password tokens
- **JiraIntegration** / **JiraUserMapping** — Jira OAuth and email cache
- **AuditLog** — Append-only activity log (no FK to `User`; stores actor id/email/role on each row)

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| * | `/api/auth/[...nextauth]` | NextAuth sign-in/sign-out/session |
| POST | `/api/auth/forgot-password` | Request a password reset email |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/change-password` | Change password (authenticated) |
| GET/PATCH | `/api/auth/profile` | Read/update profile and email preferences |

### Leave Requests

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leave-requests` | List requests (filter by status, userId, date range) |
| POST | `/api/leave-requests` | Create a new request |
| PATCH | `/api/leave-requests/[id]` | Approve, reject, cancel; admins/managers may set `kitDaysUsed` / `evidenceProvided` |

### Leave Balances

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leave-balances` | Current user's balances (or `?userId=...` for another user) |

### Team Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/team-members` | List all team members |
| POST | `/api/team-members` | Add a new team member (Admin/Manager only) |
| PATCH | `/api/team-members/[id]` | Update a team member |
| DELETE | `/api/team-members/[id]` | Remove a team member (Admin only) |

### Jira Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jira/connect` | Start Jira OAuth 2.0 3LO flow (Admin only) |
| GET | `/api/jira/callback` | OAuth callback — exchanges code for tokens |
| GET | `/api/jira/status` | Check Jira connection status |
| POST | `/api/jira/disconnect` | Remove Jira integration (Admin only) |
| GET | `/api/jira/coverage` | Open issues + available teammates for a user/date range |
| POST | `/api/jira/reassign` | Reassign a Jira issue to another team member |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/holidays` | List public holidays (filter by country, year) |
| GET | `/api/leave-types` | List leave types for the org |
| POST | `/api/leave-types` | Create a new leave type (Admin only) |
| PATCH | `/api/leave-types/[id]` | Update a leave type (Admin only) |
| DELETE | `/api/leave-types/[id]` | Delete a leave type if unused (Admin only) |
| GET | `/api/leave-policies` | List country leave policies (`?leaveTypeId=` optional) |
| POST | `/api/leave-policies` | Create a country policy (Admin only) |
| PATCH | `/api/leave-policies/[id]` | Update allowance / carry-over max (Admin only) |
| DELETE | `/api/leave-policies/[id]` | Delete a policy (Admin only) |
| GET | `/api/organization/settings` | Org UK settings + `plan` (any authenticated user) |
| PATCH | `/api/organization/settings` | Update UK settings (Admin only) |
| GET | `/api/reports/uk-compliance` | UK compliance report datasets |
| GET | `/api/reports/analytics` | Absence analytics |
| GET | `/api/reports/payroll` | Approved leave × daily holiday pay rate for `from`/`to` (Admin/Manager) |
| GET | `/api/weekly-earnings` | List weekly earnings (owner or Admin/Manager) |
| POST | `/api/weekly-earnings` | Create/update earnings row(s) for the 52-week holiday pay calc (Admin/Manager) |
| GET | `/api/weekly-earnings/coverage` | Earnings-history coverage per employee (Admin/Manager) |
| POST | `/api/carry-over/process` | Year-end carry-over (`fromYear`, optional `dryRun`; Admin) |
| GET | `/api/audit-logs` | Paginated audit log (`action`, `resource`, date range, `cursor`; Admin, **Pro** plan) |
| GET | `/api/overlap` | Check team overlap for a date range |
| GET/POST | `/api/weekly-hours` | Rolling weekly hours for variable-hours users (UK pro-rata) |
| GET | `/api/slack/status` | Check Slack integration status |
| POST | `/api/cron/weekly-digest` | Send weekly digest emails (cron-triggered) |

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed database with demo data
npm run db:studio    # Open Prisma Studio (database GUI)
```

## Roadmap

- [x] Email notifications (request submitted, approved, rejected)
- [x] Landing page
- [x] Password reset flow
- [x] Profile & account settings
- [x] Weekly digest email for managers
- [x] Onboarding wizard for new organizations
- [x] Jira project coverage (flag, suggest, one-click reassign)
- [x] Subscription tiers (`Organization.plan`) with plan-aware Help and limits
- [x] UK compliance reporting, analytics, CSV exports, year-end carry-over processing
- [x] UK 52-week holiday pay calculator + payroll export
- [x] Custom leave types / per-country policies (admin CRUD) and audit trail (Pro)
- [ ] Public HTTP API with API keys (not implemented)
- [ ] Advanced skill-based coverage planning
- [ ] Multi-organization support (single user across orgs)
- [ ] Linear / Asana integration
- [ ] Microsoft Teams bot
- [ ] Mobile-responsive improvements

## License

Private — not yet licensed for distribution.

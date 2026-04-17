# Coverboard

Team leave management for small, distributed teams. See who's out, plan coverage, and manage leave in one place — with built-in support for country-specific policies, email notifications, a Slack bot, and Jira project coverage.

Built for teams of 5–15 people, especially those spread across the UK, Africa, LATAM, and SEA where public holidays and statutory leave rules vary wildly. Includes full UK statutory compliance — SSP, maternity, paternity, shared parental leave, regional bank holidays, pro-rata entitlements, and Bradford Factor reporting.

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

See `.env.example` for all optional variables (Resend, Slack, Jira, cron secret).

### 3. Set up the database

```bash
npx prisma db push      # Create tables
npm run db:seed          # Seed demo data
```

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

The seed creates an "Acme Global" organization with 6 users across Nigeria, Kenya, and Brazil, 4 leave types, country-specific policies, sample leave requests, and 27 public holidays.

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
      settings/
        page.tsx                  Org settings, leave types, Slack/Jira config
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
      leave-requests/route.ts     Leave request CRUD (list + create)
      leave-requests/[id]/route.ts  Approve/reject/cancel
      leave-types/route.ts        Leave type management
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
    landing/                      Landing page (navbar, hero, features, pricing)
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
    prisma.ts                     Prisma client singleton
    slack.ts                      Slack client, request verification, user resolution
    slack-messages.ts             Block Kit message builders
    slack-notifications.ts        Notification dispatch (new request, status change)
    types.ts                      Shared TypeScript types
    utils.ts                      cn(), date helpers, country names
    validations.ts                Zod schemas
prisma/
  schema.prisma                   Database schema (10 models, 3 enums)
  seed.ts                         Demo data seeder
vercel.json                       Cron job configuration (weekly digest)
```

## Database Schema

Ten models with three enums:

- **Organization** — The team/company
- **User** — Team members with role (Admin/Manager/Member), member type (Employee/Contractor/Freelancer), and country code
- **LeaveType** — Configurable leave categories (Annual, Sick, Parental, Compassionate) with color and default allowance
- **LeavePolicy** — Country-specific overrides for leave type allowances (e.g., Annual Leave in Kenya = 21 days)
- **LeaveRequest** — Individual leave requests with status workflow (Pending -> Approved/Rejected/Cancelled)
- **PublicHoliday** — Country-specific holidays displayed on the calendar
- **PasswordResetToken** — Secure, single-use tokens for the forgot-password flow
- **JiraIntegration** — Per-org Jira OAuth credentials (cloud ID, tokens, site URL)
- **JiraUserMapping** — Cached email-based mapping between Coverboard users and Jira accounts

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
| PATCH | `/api/leave-requests/[id]` | Approve, reject, or cancel a request |

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
| GET | `/api/overlap` | Check team overlap for a date range |
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
- [ ] Advanced skill-based coverage planning
- [ ] Carry-over and accrual logic at year-end
- [ ] Multi-organization support
- [ ] Linear / Asana integration
- [ ] Microsoft Teams bot
- [ ] Mobile-responsive improvements

## License

Private — not yet licensed for distribution.

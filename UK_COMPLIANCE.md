# UK Compliance Implementation

This document describes the UK compliance extension added to Coverboard.

## Scope

The UK support is implemented as additive behavior under `countryCode = "GB"` and organization-level UK settings.
Existing country logic (LATAM/Africa/SEA) remains unchanged.

## Data Model Changes

Updated `prisma/schema.prisma` with new UK-related fields and models:

- `Organization`
  - `plan` (`SubscriptionPlan`: `STARTER` | `GROWTH` | `SCALE` | `PRO`; gates support tiers, audit trail, etc.)
  - `ukBankHolidayInclusive` (default `true`)
  - `ukBankHolidayRegion` (`ENGLAND_WALES` default)
  - `ukCarryOverEnabled` (default `false`)
  - `ukCarryOverMax` (default `0`)
  - `ukCarryOverExpiryMonth` (default `3`)
  - `ukCarryOverExpiryDay` (default `31`)
  - `dataResidency` (`EU` default; options `UK|EU|US`)
- `User`
  - `employmentType` (`FULL_TIME|PART_TIME|VARIABLE_HOURS`)
  - `daysWorkedPerWeek`, `fteRatio`
  - `rightToWorkVerified` (`boolean | null`)
  - `department`, `serviceStartDate`, `ukParentalLeaveChildCount`
- `LeaveType`
  - `category` (`PAID|UNPAID|STATUTORY`)
  - `requiresEvidence`, `minNoticeDays`, `durationLogic`, `countryCode`
- `LeaveRequest`
  - `evidenceProvided`, `kitDaysUsed`
- New models
  - `BankHoliday` (region-specific UK bank holidays)
  - `UserWeeklyHours` (rolling history for variable-hours pro-rata)
  - `LeaveCarryOverBalance` (separate carry-over balance with expiry)
  - `AuditLog` (immutable activity log; Pro plan — see main README)

## UK Leave Types Added

`src/lib/country-policies.ts` now includes UK (`GB`) with these defaults:

1. Annual Leave (28)
2. Statutory Sick Pay (SSP)
3. Statutory Maternity Leave
4. Statutory Paternity Leave
5. Shared Parental Leave (SPL)
6. Adoption Leave
7. Parental Bereavement Leave
8. Unpaid Parental Leave

Each UK leave type includes:
- category
- default entitlement (or duration baseline)
- requires evidence
- minimum notice
- duration logic notes
- `countryCode = GB` tagging for UK-specific leave metadata

## UK Rules Engine Utilities

Added `src/lib/uk-compliance.ts` with:

- `calculateUkProRatedAnnualLeave()`:
  - part-time: `(daysWorkedPerWeek / 5) * 28`
  - variable-hours: rolling 52-week average from `UserWeeklyHours`
- `calculateVariableHoursFte()`
- `calculateBradfordFactor(S, D)` -> `S^2 * D`
- `calculateSspPayableDays()` (3 waiting days)
- `calculateEstimatedSspCost()` using `SSP_WEEKLY_RATE`
- `getUkBankHolidaysForRegion(year, region)` for 2026–2027 (extend the map as new years are needed)

## Environment Constants

Added optional env keys in `.env.example`:

- `SSP_WEEKLY_RATE` (default 116.75)
- `SMP_WEEKLY_RATE` (default 184.03)
- `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_PRIORITY_SUPPORT_EMAIL`, `NEXT_PUBLIC_SLA_SUPPORT_EMAIL`, `NEXT_PUBLIC_ONBOARDING_BOOKING_URL` — Help page contact targets (see `.env.example`)

## Onboarding + Seeding Behavior

`src/app/api/onboarding/complete/route.ts` now:

- creates UK leave metadata when GB is selected
- avoids generating generic GB holidays from static month/day rules
- seeds regional UK bank holidays (all 3 regions) for the current calendar year and the next year into `BankHoliday`

## Leave Balances and Portal Display

`src/lib/leave-balances.ts` and `src/components/dashboard/leave-balances.tsx` now support:

- UK pro-rated annual entitlement
- bank holiday inclusive/exclusive allowance adjustment
- separate carry-over balance + expiry display

## Team Profile + Compliance Signal

Team admin UI/API now supports:

- employment type
- days worked per week
- FTE ratio
- department
- right-to-work verification

Files:
- `src/components/team/member-form.tsx`
- `src/components/team/member-card.tsx`
- `src/app/(dashboard)/team/page.tsx`
- `src/app/api/team-members/route.ts`
- `src/app/api/team-members/[id]/route.ts`
- `src/lib/validations.ts`

Amber warnings are shown for missing/unverified right-to-work.

## Organization UK Settings + Data Residency

Added API:
- `src/app/api/organization/settings/route.ts`

Added settings UI:
- `src/app/(dashboard)/settings/page.tsx`

Supports:
- bank holiday inclusive/exclusive toggle
- UK region selection
- carry-over enable + max
- data residency (`UK|EU|US`)
- visible trust label when residency is `UK`: "Data stored in UK servers."

## UK Compliance Reporting

Added APIs:
- `src/app/api/reports/uk-compliance/route.ts` — Bradford Factor, right-to-work, holiday usage, SSP liability, parental leave (KIT days with caps and remaining)
- `src/app/api/reports/analytics/route.ts` — absence analytics (trends, breakdowns; **Admin** and **Manager** only)

**Reports UI** (`src/app/(dashboard)/reports/page.tsx`):

- **Analytics** — monthly absence trend, leave-type and department breakdowns, top absence days
- **UK compliance tabs** — per-report CSV export
- **Year-end rollover** (admins) — preview and run carry-over into `LeaveCarryOverBalance` via `POST /api/carry-over/process`

**Carry-over processing** (`src/app/api/carry-over/process/route.ts`):

- Admin-only; uses org UK carry-over settings (max days, expiry date)
- Supports `dryRun` to preview who would receive carried days for a given `fromYear`

**Parental leave / KIT**: admins and managers can update `kitDaysUsed` on a leave request (PATCH `/api/leave-requests/[id]`) and see usage in compliance exports.

Settings page includes UK Compliance summary cards consuming the uk-compliance API.

## Tests Added

Added `src/lib/uk-compliance.test.ts` for:
- pro-rata calculation
- Bradford factor
- SSP waiting-day logic
- UK bank holiday region filtering

Added script:
- `npm test` -> `tsx --test src/lib/**/*.test.ts`

## Notes

- Existing country configs are preserved.
- UK logic is additive and country-scoped.
- Backend runtime checks now enforce leave-type evidence/notice where configured.
- **Product-wide docs** (subscription `plan`, Help & Support env vars, audit trail, landing pricing): see **`README.md`** and **`.env.example`**.

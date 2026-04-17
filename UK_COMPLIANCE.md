# UK Compliance Implementation

This document describes the UK compliance extension added to Coverboard.

## Scope

The UK support is implemented as additive behavior under `countryCode = "GB"` and organization-level UK settings.
Existing country logic (LATAM/Africa/SEA) remains unchanged.

## Data Model Changes

Updated `prisma/schema.prisma` with new UK-related fields and models:

- `Organization`
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

Added API:
- `src/app/api/reports/uk-compliance/route.ts`

Includes:
- holiday usage dataset
- absence trigger report (Bradford threshold default 200)
- SSP liability report
- parental leave tracker (KIT days with caps)

Settings page includes UK Compliance summary cards consuming this API.

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

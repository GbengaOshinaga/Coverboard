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
  - `qualifyingDaysPerWeek` (Int, default `5`; days SSP is payable on)
  - `averageWeeklyEarnings` (Decimal 8,2; SSP Lower Earnings Limit check)
  - `rightToWorkVerified` (`boolean | null`)
  - `department`, `serviceStartDate`, `ukParentalLeaveChildCount`
- `LeaveType`
  - `category` (`PAID|UNPAID|STATUTORY`)
  - `requiresEvidence`, `minNoticeDays`, `durationLogic`, `countryCode`
- `LeaveRequest`
  - `evidenceProvided`, `kitDaysUsed`
  - `dailyHolidayPayRate` (Decimal, captured at booking for annual leave — see Holiday Pay below)
  - `sspDaysPaid` (Int, default `0`; cumulative for 28-week cap tracking)
  - `sspLimitReached` (Bool, default `false`; set when 28-week cap reached)
  - `smpAverageWeeklyEarnings` (Decimal 8,2; AWE captured at booking)
  - `smpPhase1EndDate` / `smpPhase2EndDate` (Date; +6 / +39 weeks from start)
  - `smpPhase1WeeklyRate` (Decimal 8,2; 90% AWE)
  - `smpPhase2WeeklyRate` (Decimal 8,2; `min(SMP_FLAT_RATE, 90% AWE)`)
- New models
  - `BankHoliday` (region-specific UK bank holidays)
  - `UserWeeklyHours` (rolling history for variable-hours pro-rata)
  - `LeaveCarryOverBalance` (separate carry-over balance with expiry)
  - `WeeklyEarning` (gross earnings per week for 52-week holiday pay calc)
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
- `calculateSspPayableDays()` (3 waiting days — unchanged)
- `calculateSspDailyRate(qualifyingDaysPerWeek, weeklyRate?)` — divides the
  weekly rate by the employee's qualifying days (NOT 7). Defaults to 5 when
  the value is missing/invalid.
- `calculateSspEntitlement({ averageWeeklyEarnings, sspDaysPaidInPeriod,
  qualifyingDaysPerWeek })` — runs the two statutory eligibility gates:
  1. Lower Earnings Limit: `avg < LEL_WEEKLY` → `{ eligible: false,
     reason: "Below Lower Earnings Limit" }`.
  2. 28-week cap: `sspDaysPaidInPeriod >= 28 × qualifyingDaysPerWeek` →
     `{ eligible: false, reason: "SSP 28-week limit reached" }`.
  When eligible it returns `{ dailyRate, remainingDays, maxDays, … }`.
- `calculateEstimatedSspCost(start, end, weeklyRate?, qualifyingDaysPerWeek?)`
  uses `calculateSspDailyRate` internally so callers never divide by 7.
- `SSP_MAX_WEEKS` (28), `UK_LEL_WEEKLY` (123 for 2024/25).
- `getUkBankHolidaysForRegion(year, region)` for 2026–2027 (extend the map as new years are needed)

## Environment Constants

Added optional env keys in `.env.example`. **Update each April via HMRC guidance.**

- `SSP_WEEKLY_RATE` (default `116.75` — 2024/25)
- `SMP_WEEKLY_RATE` (default `184.03` — 2024/25)
- `SMP_FLAT_RATE` (alias of `SMP_WEEKLY_RATE` consumed by the SMP phase calculator; either env key is honoured)
- `LEL_WEEKLY` (default `123` — Lower Earnings Limit for 2024/25; SSP is not payable below this average weekly earnings)
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

## Statutory Sick Pay (SSP)

SSP calculations previously (a) divided the weekly rate by 7, (b) skipped
the Lower Earnings Limit check, and (c) did not track the statutory 28-week
cap — all HMRC-penalty risks. Those three issues are fixed end-to-end:

1. **Daily rate on qualifying days** — `calculateSspDailyRate` divides by
   the employee's `qualifyingDaysPerWeek` (default 5). Part-timers on a
   3- or 4-day week now get the correct (higher) daily figure.
2. **Lower Earnings Limit gate** — `calculateSspEntitlement` returns
   `{ eligible: false, reason: "Below Lower Earnings Limit" }` when
   `averageWeeklyEarnings < LEL_WEEKLY`. The boundary is inclusive:
   exactly £123/wk is eligible.
3. **28-week cumulative cap** — `LeaveRequest.sspDaysPaid` records the
   payable days for each SSP spell; `LeaveRequest.sspLimitReached` flags
   the spell that tipped an employee over `28 × qualifyingDaysPerWeek`.
   Linked PIWs are joined by a 56-day rolling window. When the cap is
   first reached, an email goes to org admins/managers ("[Employee] has
   reached the 28-week SSP limit. SSP ends [date]. Employee may be
   eligible for Employment Support Allowance.") and an
   `leave_request.ssp_cap_reached` audit entry is written.

The waiting-days logic (`calculateSspPayableDays`) is unchanged.

`POST /api/leave-requests` response includes an `sspInfo` block when the
leave type name contains `SSP`:

```ts
{
  eligible: boolean,
  reason?: "Below Lower Earnings Limit" | "SSP 28-week limit reached" | "Missing average weekly earnings",
  payableDays: number,
  sspDaysPaidThisRequest: number,
  cumulativeSspDaysPaid: number,
  dailyRate: number,
  estimatedCost: number,
  remainingDaysAfter: number,
  limitReached: boolean,
}
```

## Statutory Maternity Pay (SMP) — Phase Tracking

SMP has two statutory phases:

- **Phase 1** (weeks 1–6): **90% of Average Weekly Earnings (AWE)**.
- **Phase 2** (weeks 7–39): the **lower** of the flat weekly rate
  (`SMP_FLAT_RATE`, £184.03 for 2024/25) **or** 90% AWE.

Even when payroll issues the actual payment, Coverboard records AWE and the
phase rates at the moment the leave is booked so payroll is supplied with
legally correct numbers.

- **Calculator** — `src/lib/smpCalculator.ts`
  - `calculateAWE(weeklyEarnings: number[])` — divides the total by 8.
  - `calculateSMPPhaseRates(awe, flatRate?)` → `{ phase1Weekly, phase2Weekly }`
    where `phase2Weekly = min(flatRate, 90% AWE)`.
  - `calculateSMPPhaseDates(start)` → `{ phase1EndDate, phase2EndDate }`
    (start + 6 and + 39 weeks).
  - `getCurrentSMPPhase({...})` → `{ phase: "phase_1" | "phase_2" | "ended"
    | "not_started", weeklyRate, label, phase1EndDate, phase2EndDate }`.
  - `getAweForUser(userId, before?)` — pulls the most recent 8 paid
    `WeeklyEarning` rows (ignoring `isZeroPayWeek`) and feeds them into
    `calculateAWE`. Returns `null` when there is no history.
  - `isMaternityLeaveType(name)` — case-insensitive match on `maternity`.
- **Leave request integration** (`src/app/api/leave-requests/route.ts`):
  on create for a maternity leave type, the server computes AWE and both
  phase rates from the prior 8-week earnings history and stores them on
  the `LeaveRequest` alongside `smpPhase1EndDate` / `smpPhase2EndDate`.
  The PATCH route back-fills phase dates/rates on approval for legacy
  records that predate this feature.
- **UK compliance report** (`/api/reports/uk-compliance` → parental tab):
  each active maternity row now exposes an `smp` object with the current
  phase (`phase_1` / `phase_2` / `ended` / `not_started`), weekly rate,
  label (e.g. "Phase 1 (90% AWE)"), and both phase end dates.
- **Payroll export** (`/api/reports/payroll`): maternity rows include an
  `smp` block with AWE, the current phase, current weekly rate, and
  both phase weekly rates — so whichever payroll system consumes the
  CSV/JSON can apply the correct weekly payment for every payslip in
  the export window.

## Holiday Pay (52-Week Average)

Per the Working Time Regulations 1998 as amended in 2020, UK holiday pay must reflect **normal remuneration** including regular overtime, commission, and shift allowances, averaged over the **last 52 paid weeks**. Zero-pay weeks are excluded.

- **Model**: `WeeklyEarning` stores gross earnings per `(userId, weekStartDate)` as `DECIMAL(10,2)` plus `hoursWorked DECIMAL(6,2)` and `isZeroPayWeek`.
- **Calculator**: `src/lib/holidayPay.ts`
  - `calculateHolidayPayRate(weeks)` → daily rate (weekly average ÷ 5); filters zero-pay weeks; caps at most recent 52 paid weeks.
  - `getDailyHolidayPayRateForUser(userId)` loads up to 260 rows and returns `null` when no history exists.
- **Leave request integration** (`src/app/api/leave-requests/route.ts`): on create, if the leave type name matches `/annual/i`, the daily rate is computed and stored on `LeaveRequest.dailyHolidayPayRate`. Failure never blocks request creation.
- **Payroll export** (`src/app/api/reports/payroll/route.ts`): for a date range, emits daily rate × days taken per approved leave request, preferring the rate captured at booking. The **Payroll export** tab on `/reports` displays totals and supports CSV export.
- **Settings warning**: the Settings page lists any employee without earnings history in an amber banner.
- **Earnings API**: `GET/POST /api/weekly-earnings`, `GET /api/weekly-earnings/coverage`.

## Tests Added

Added `src/lib/uk-compliance.test.ts` for:
- pro-rata calculation
- Bradford factor
- SSP waiting-day logic
- SSP daily rate for 3/4/5 qualifying days per week (and the missing-value default)
- SSP daily-rate regression guard: rate must NOT equal `weekly / 7`
- Lower Earnings Limit boundary (below, exactly at, and above £123/wk)
- 28-week cap boundary at 5-, 4-, and 3-day qualifying weeks (139/140/141, 111/112, 83/84)
- `UK_SSP_WEEKLY_RATE` default still matches the 2024/25 rate (116.75)
- UK bank holiday region filtering

Added `src/lib/smpCalculator.test.ts` for:
- `calculateAWE` — 8-week average, decimal handling, empty input, 8-week window cap, no auto-exclusion of zero-earnings weeks
- `calculateSMPPhaseRates` — phase 1 at 90% AWE; phase 2 using 90% AWE when it's lower than the flat rate (low earner); phase 2 using the flat rate when 90% AWE is higher (higher earner); explicit flat-rate override
- `calculateSMPPhaseDates` — +6/+39 weeks, no input mutation
- `getCurrentSMPPhase` — phase_1, phase_2, ended, not_started branches
- `isMaternityLeaveType` — variants / null safety
- `SMP_FLAT_RATE` default guard (184.03 for 2024/25)

Added `src/lib/holidayPay.test.ts` for:
- zero-pay-week exclusion
- fewer than 52 weeks
- overtime/commission inclusion (gross earnings used)
- 52-week window cap (most recent only)
- rounding to 2dp

Added script:
- `npm test` -> `tsx --test src/lib/**/*.test.ts`

## Notes

- Existing country configs are preserved.
- UK logic is additive and country-scoped.
- Backend runtime checks now enforce leave-type evidence/notice where configured.
- **Product-wide docs** (subscription `plan`, Help & Support env vars, audit trail, landing pricing): see **`README.md`** and **`.env.example`**.

<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# UK statutory leave types — overview

UK employment law gives every employee a set of minimum leave rights. These are called statutory leave entitlements — meaning they are set by law, not by the employer. You cannot offer less than these minimums, regardless of what is written in an employment contract.

This page gives you a plain-English summary of each type. Coverboard comes pre-configured with all eight of them when you set up an organisation with UK employees.

> **UK-only features.** Statutory rules below apply automatically only to employees with a UK work location set on their profile (workCountry = GB). Employees in other countries are governed by their own country policy under **Settings → Country policies**.

---

## Annual leave

Every worker is entitled to at least 5.6 weeks of paid holiday per year. For someone working 5 days a week, that is 28 days.

A few things employers commonly get wrong:

**Bank holidays.** The 28-day minimum can include bank holidays or be on top of them — the choice is yours as an employer, but it must be clearly stated in the employment contract. Coverboard lets you configure this per company under **Settings → UK Compliance → Bank holiday treatment**.

**Part-time workers.** They get the same entitlement proportionally. Someone working 3 days a week gets (3 ÷ 5) × 28 = 16.8 days, rounded up to 17. Coverboard calculates this automatically using the **Days worked per week** field on the team member profile.

**Carry-over.** By default, unused annual leave cannot be carried over to the next leave year — it is use it or lose it. However you can configure a carry-over allowance of up to 8 days under **Settings → UK Compliance → Carry-over**. The system will automatically flag balances that expire.

**You cannot pay in lieu of holiday** — except when employment ends. Employees must actually take their leave.

---

## Statutory Sick Pay (SSP)

When an employee is too ill to work, you must pay SSP — provided they qualify.

> This feature is only available for employees with a UK work location set on their profile.

**Qualifying conditions:**
- They must earn at least £123 per week (the Lower Earnings Limit) — set on the employee profile as **Average weekly earnings**
- They must have been sick for at least 4 consecutive days (including non-working days)

**How it works:**
- Days 1 to 3 are called waiting days — no SSP is paid
- SSP starts from day 4 at £123.25 per week (2026/27 default; configurable via the `SSP_WEEKLY_RATE` environment variable, which payroll updates each April)
- The daily rate is calculated as the weekly rate divided by the employee's **Qualifying days per week** (the contracted working days, not 7) — a 3-day-a-week employee earns a higher daily rate than a 5-day-a-week employee
- SSP can be paid for a maximum of 28 weeks in any one period of incapacity
- Linked sickness spells joined by a 56-day window count towards the same 28-week limit
- After 28 weeks, SSP stops — the employee may be eligible for Employment Support Allowance, and Coverboard emails admins/managers when the cap is reached

**Fit notes.** Employees can self-certify sickness for up to 7 calendar days. After that, a fit note from a GP is required. Mark this on the leave request using the **Evidence provided** flag.

Coverboard tracks waiting days, calculates the correct daily SSP using qualifying days per week, gates eligibility on the Lower Earnings Limit, and tracks the cumulative 28-week ceiling automatically. The created leave request returns an `sspInfo` block with eligibility, daily rate, days paid this request, cumulative days paid, and remaining days.

---

## Statutory Maternity Leave

Eligible employees can take up to 52 weeks of maternity leave — split into 26 weeks of Ordinary Maternity Leave and 26 weeks of Additional Maternity Leave.

**Statutory Maternity Pay (SMP)** is paid for up to 39 weeks in two phases:
- **Phase 1 (weeks 1–6):** 90% of average weekly earnings (AWE)
- **Phase 2 (weeks 7–39):** £194.32 per week (2026/27 default), or 90% of AWE if that is lower

The remaining 13 weeks are unpaid.

Coverboard records average weekly earnings (AWE — calculated from the prior 8 paid weeks of `WeeklyEarning` rows) for each maternity leave case, calculates both pay phases and their end dates at the moment the leave is booked, and surfaces the current phase, weekly rate, and phase dates on the **Reports → Parental leave** tab and the payroll export.

**KIT days.** Employees on maternity leave can work up to 10 Keeping In Touch (KIT) days without ending their leave. Admins and managers can update **KIT days used** on a leave request from the request review screen, and Coverboard warns when the limit is approaching.

---

## Statutory Paternity Leave

The eligible employee (partner of the person who gave birth or adopted) can take either 1 or 2 consecutive weeks of paternity leave. It must be taken within 56 days of the birth or placement.

Statutory Paternity Pay (SPP) is paid at the same flat rate as SMP weeks 7–39 — £194.32 per week (2026/27), or 90% of average weekly earnings if lower.

When you record the **Child birth date** on a paternity leave request, Coverboard enforces the 56-day window and rejects requests that fall outside it.

---

## Shared Parental Leave (SPL)

SPL allows eligible parents to share up to 50 weeks of leave (and up to 37 weeks of pay) between them, after the mother or primary adopter curtails their maternity or adoption leave.

This is one of the more administratively complex leave types — it requires a curtailment notice from the primary leave taker, and the shared leave can be taken in multiple blocks. Mark the curtailment using the **SPL curtailment confirmed** flag on the leave request.

Coverboard tracks SPL allocations for both parents and calculates the remaining shared entitlement as leave is taken.

**SPLIT days.** Employees on SPL can work up to 20 Shared Parental Leave In Touch (SPLIT) days without ending their leave. These are tracked separately from KIT days using the **SPLIT days used** field on the leave request.

---

## Adoption Leave

An employee who is adopting a child is entitled to the same leave and pay as maternity leave — up to 52 weeks of leave and 39 weeks of Statutory Adoption Pay (SAP).

The same KIT day rules apply (up to 10 days).

---

## Parental Bereavement Leave

If an employee loses a child under the age of 18, or suffers a stillbirth after 24 weeks of pregnancy, they are entitled to 2 weeks of Parental Bereavement Leave.

This leave can be taken as a single 2-week block or as two separate 1-week blocks, within 56 weeks of the death.

Statutory Parental Bereavement Pay is paid at the same flat rate as SSP for eligible employees.

---

## Unpaid Parental Leave

Employees with at least one year of service are entitled to 18 weeks of unpaid parental leave per child, to be taken before the child's 18th birthday.

A maximum of 4 weeks (20 working days) can be taken in any one leave year per child — Coverboard enforces this cap on request creation. At least 21 days' notice is required.

This leave is unpaid — it does not affect the employee's other leave entitlements.

---

## A note on contractual leave

Everything above is the statutory minimum — the floor, not the ceiling. Many employers offer more generous terms: extra holiday days, enhanced maternity pay, paid compassionate leave, and so on. These are called contractual entitlements.

Coverboard supports both. Statutory leave types are added automatically when you add UK employees during onboarding. You can add contractual leave types (such as "Enhanced Maternity Pay top-up" or "Compassionate Leave") through **Settings → Leave types** and configure per-country allowances under **Settings → Country policies**.

> Custom leave policies are available on the **Pro** plan. Bradford Factor, SSP tracking, pro-rata, right to work and bank-holiday region config are available from **Growth** upwards. Parental tracker, KIT/SPLIT day tracking, holiday pay 52-week averaging and the full UK compliance report pack are available from **Scale**.

---

## Quick reference

| Leave type | Max duration | Paid? | Key trigger |
|---|---|---|---|
| Annual leave | 5.6 weeks/year | Yes | Entitlement-based |
| SSP | 28 weeks | Yes (£123.25/wk default) | 4 consecutive sick days |
| Maternity leave | 52 weeks | 39 weeks SMP | Birth or adoption |
| Paternity leave | 2 weeks | Yes (SPP) | Birth/placement within 56 days |
| Shared Parental Leave | 50 weeks shared | 37 weeks shared | Maternity curtailment |
| Adoption leave | 52 weeks | 39 weeks SAP | Child placement |
| Parental Bereavement | 2 weeks | Yes (SPBP) | Child death under 18 |
| Unpaid Parental Leave | 18 weeks per child | No | After 1 year service |

> Statutory pay rates change every April. Coverboard reads the current rates from the `SSP_WEEKLY_RATE`, `SMP_WEEKLY_RATE` (or `SMP_FLAT_RATE`) and `LEL_WEEKLY` environment variables. If you don't set these, the values shown above (the 2026/27 defaults) are used.

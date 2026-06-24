<!-- Last updated: 2026-06-24 — reflects the 2026 SSP reform, carer's & neonatal care leave, the paternity reform, and the 12.07% irregular-hours holiday method -->
# UK statutory leave types — overview

UK employment law gives every employee a set of minimum leave rights. These are called statutory leave entitlements — meaning they are set by law, not by the employer. You cannot offer less than these minimums, regardless of what is written in an employment contract.

This page gives you a plain-English summary of each type. Coverboard comes pre-configured with all ten of them when you set up an organisation with UK employees.

> **UK-only features.** Statutory rules below apply automatically only to employees with a UK work location set on their profile (workCountry = GB). Employees in other countries are governed by their own country policy under **Settings → Country policies**.

---

## Annual leave

Every worker is entitled to at least 5.6 weeks of paid holiday per year. For someone working 5 days a week, that is 28 days.

A few things employers commonly get wrong:

**Bank holidays.** The 28-day minimum can include bank holidays or be on top of them — the choice is yours as an employer, but it must be clearly stated in the employment contract. Coverboard lets you configure this per company under **Settings → UK Compliance → Bank holiday treatment**.

**Part-time workers.** They get the same entitlement proportionally. Someone working 3 days a week gets (3 ÷ 5) × 28 = 16.8 days, rounded up to 17. Coverboard calculates this automatically using the **Days worked per week** field on the team member profile.

**Irregular-hours and zero-hours workers.** For workers whose hours vary, you can't use "days per week." Since April 2024 their holiday accrues at **12.07% of the hours they actually work**, and is tracked and taken in **hours**, not days. Coverboard does this automatically for employees set to **Variable hours** or **Zero-hours**: their holiday balance shows in hours (with a rough days equivalent), and leave is booked and deducted in hours. The 12.07% already includes bank holidays.

**Carry-over.** By default, unused annual leave cannot be carried over to the next leave year — it is use it or lose it. However you can configure a carry-over allowance of up to 8 days under **Settings → UK Compliance → Carry-over**. The system will automatically flag balances that expire.

**You cannot pay in lieu of holiday** — except when employment ends. Employees must actually take their leave.

---

## Statutory Sick Pay (SSP)

When an employee is too ill to work, you must pay SSP. **The rules changed on 6 April 2026** — Coverboard applies the new rules to sickness starting on or after that date, and the old rules to anything that started before.

> This feature is only available for employees with a UK work location set on their profile.

**From 6 April 2026:**
- **No waiting days** — SSP is payable from the **first** day of sickness (previously days 1–3 were unpaid).
- **No Lower Earnings Limit** — every employee qualifies regardless of earnings (the old £123-a-week floor was removed).
- The rate is the **lower of £123.25 per week or 80% of the employee's average weekly earnings** (2026/27 — set as **Average weekly earnings** on the profile). Low earners get 80% of their pay rather than nothing.
- The daily rate is the (capped) weekly rate divided by the employee's **Qualifying days per week** (the contracted working days, not 7) — a 3-day-a-week employee earns a higher daily rate than a 5-day-a-week employee
- SSP can be paid for a maximum of 28 weeks in any one period of incapacity
- Linked sickness spells joined by a 56-day window count towards the same 28-week limit
- After 28 weeks, SSP stops — the employee may be eligible for Employment Support Allowance, and Coverboard emails admins/managers when the cap is reached

**Fit notes.** Employees can self-certify sickness for up to 7 calendar days. After that, a fit note from a GP is required. Mark this on the leave request using the **Evidence provided** flag.

Coverboard pays from day 1 with no earnings gate, caps the rate at 80% of average weekly earnings, calculates the daily figure using qualifying days per week, and tracks the cumulative 28-week ceiling automatically. The created leave request returns an `sspInfo` block with eligibility, daily rate, days paid this request, cumulative days paid, and remaining days. (Sickness that started before 6 April 2026 still serves the 3 waiting days and the old earnings gate for its pre-reform portion.)

---

## Statutory Maternity Leave

Eligible employees can take up to 52 weeks of maternity leave — split into 26 weeks of Ordinary Maternity Leave and 26 weeks of Additional Maternity Leave.

**Statutory Maternity Pay (SMP)** is paid for up to 39 weeks in two phases:
- **Phase 1 (weeks 1–6):** 90% of average weekly earnings (AWE)
- **Phase 2 (weeks 7–39):** £194.32 per week (2026/27 default), or 90% of AWE if that is lower

The remaining 13 weeks are unpaid.

**SMP eligibility.** Two tests: the employee's average weekly earnings must be at least the Lower Earnings Limit (**£129/week** for 2026/27), and they must have **26 weeks' continuous service** by the qualifying week (15 weeks before the due date). Below the earnings limit, or with too little service, the employee isn't entitled to SMP from you — they may claim Maternity Allowance from DWP instead, and Coverboard does not stamp SMP rates on the leave. Enter the **Expected due date** when booking maternity so Coverboard can run the service test, and set the employee's **Employment start date** on their profile.

Coverboard records average weekly earnings (AWE — the average over the relevant 8-week period, with any blank weeks counted as zero per HMRC) for each maternity leave case, calculates both pay phases and their end dates at the moment the leave is booked (only when the employee passes both eligibility tests), and surfaces the current phase, weekly rate, and phase dates on the **Reports → Parental leave** tab and the payroll export.

**KIT days.** Employees on maternity leave can work up to 10 Keeping In Touch (KIT) days without ending their leave. Admins and managers can update **KIT days used** on a leave request from the request review screen, and Coverboard warns when the limit is approaching.

---

## Statutory Paternity Leave

The eligible employee (partner of the person who gave birth or adopted) can take 1 or 2 weeks of paternity leave. Since the 2024 reform, the two weeks can be taken **separately** (not only as one consecutive block), at any point in the **first 52 weeks** after the birth or placement, with 28 days' notice. Since 6 April 2026 it is also a **day-one right**.

Statutory Paternity Pay (SPP) is paid at the same flat rate as SMP weeks 7–39 — £194.32 per week (2026/27), or 90% of average weekly earnings if lower.

When you record the **Child birth date** on a paternity leave request, Coverboard enforces the 52-week window and rejects requests that fall outside it.

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

Employees are entitled to 18 weeks of unpaid parental leave per child, to be taken before the child's 18th birthday. Since 6 April 2026 this is a **day-one right** (it previously required one year's service).

A maximum of 4 weeks (20 working days) can be taken in any one leave year per child — Coverboard enforces this cap on request creation. At least 21 days' notice is required.

This leave is unpaid — it does not affect the employee's other leave entitlements.

---

## Carer's Leave

Since 6 April 2024, employees have a **day-one right** to **one week of unpaid leave per rolling 12 months** to care for a dependant with a long-term care need. A "week" is the length of time the employee normally works over seven days, and it can be taken in half- or whole days. Coverboard adds **Carer's Leave** as an unpaid statutory type for UK organisations.

---

## Neonatal Care Leave

Since 6 April 2025, parents whose baby is admitted to neonatal care (within 28 days of birth, for a continuous stay of 7 days or more) have a **day-one right** to up to **12 weeks** of leave — one week for every 7 full days the baby spends in care, taken within 68 weeks of the birth.

**Statutory Neonatal Care Pay** is £194.32 per week (2026/27) or 90% of average weekly earnings if lower, for those who meet the service and earnings tests. Coverboard adds **Neonatal Care Leave** as a paid statutory type and surfaces the weekly rate and estimated pay on the payroll export.

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
| SSP | 28 weeks | Yes (£123.25/wk or 80% AWE) | Off sick (paid from day 1) |
| Maternity leave | 52 weeks | 39 weeks SMP | Birth or adoption |
| Paternity leave | 2 weeks | Yes (SPP) | Birth/placement (within 52 weeks) |
| Shared Parental Leave | 50 weeks shared | 37 weeks shared | Maternity curtailment |
| Adoption leave | 52 weeks | 39 weeks SAP | Child placement |
| Parental Bereavement | 2 weeks | Yes (SPBP) | Child death under 18 |
| Unpaid Parental Leave | 18 weeks per child | No | Day-one right |
| Carer's leave | 1 week/year | No | Caring for a dependant |
| Neonatal care leave | 12 weeks | Yes | Baby in neonatal care |

> Statutory pay rates change every April when HMRC publishes the new tax-year figures. The rates shown above are the current 2026/27 values, and Coverboard keeps them up to date so your calculations stay accurate.

<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# Holiday pay — why it includes overtime

Most employers assume holiday pay is simply based on an employee's basic salary. This is one of the most common — and costly — mistakes in UK HR.

**The short version:** if an employee regularly works overtime, their holiday pay must reflect that. Paying basic salary only during holiday is an underpayment of wages — and employees can claim the difference back years.

> This feature is only available for employees with a UK work location set on their profile. The 52-week earnings history table appears on a team member's profile only when their **Work location** is United Kingdom (GB).

---

## Why the law changed

Before 2020, most UK employers calculated holiday pay on basic salary alone. A series of Employment Tribunal cases (most notably Bear Scotland v Fulton) established that this was wrong. The courts ruled that holiday pay must reflect what an employee would normally earn — including regular overtime, shift allowances, and commission.

The Working Time Regulations 1998 (as amended) now require that the first 4 weeks of statutory holiday are paid at "normal pay" — not basic pay.

---

## What counts as normal pay

Normal pay includes any payment that is intrinsically linked to the work the employee performs. In practice this means:

- Regular overtime — both compulsory and voluntary, if it is worked with sufficient regularity
- Shift allowances and unsocial hours premiums
- Commission that forms part of normal remuneration
- Work-related travel allowances (not reimbursements for actual expenses)

It does not include: genuinely ad hoc overtime that is irregular and exceptional, one-off bonuses unrelated to work performed, or expense reimbursements.

---

## How Coverboard calculates it

Coverboard uses a 52-week earnings average to determine an employee's correct holiday pay rate. This is built into the **Holiday pay earnings history** section of every UK team member's profile.

Here is how it works:

1. Coverboard looks at the employee's gross earnings over the last 52 weeks they were actually paid (weeks marked **Zero pay week** — for example, unpaid leave or sickness with no SSP — are excluded from the calculation)
2. It totals those earnings and divides by the number of paid weeks
3. It then divides by 5 to produce a daily rate
4. When an annual leave request is created, that daily rate is captured on the request (as `dailyHolidayPayRate`) and surfaced on the **Reports → Payroll export** tab so payroll has the legally correct figure at the moment the leave was booked

This means the figure your payroll system receives already reflects overtime and variable pay — you do not need to calculate it manually.

---

## Where to manage earnings history

Earnings history lives on each team member's profile.

**Path:** **Team → click the member → Holiday pay earnings history** (UK employees only).

You can manage entries two ways:

**Manual entry** — add or edit individual rows directly in the table on the member profile. The table columns are **Week starting**, **Gross earnings**, **Hours worked**, **Zero pay week**.

**CSV import** — use the import box at the top of the section to upload a CSV (or paste CSV text). The format is:

| Column | Required | Format / values |
|---|---|---|
| `week_starting` | Yes | `YYYY-MM-DD` — must fall on a Monday |
| `gross_earnings` | Yes (unless zero week) | Number, max 1,000,000, no currency symbol |
| `hours_worked` | Yes | Number between 0 and 168 |
| `zero_pay_week` | Yes | `true`, `false`, `1`, `0`, `yes`, or `no` (when `true`, gross/hours are forced to 0) |

You can download a working CSV template from the import box (the **Download template** button). A minimal valid file looks like:

```
week_starting,gross_earnings,hours_worked,zero_pay_week
2026-01-05,650.00,37.5,false
2026-01-12,720.50,40.0,false
2026-01-19,0,0,true
```

The importer validates each row, flags duplicates against existing weeks, and shows you a preview before committing — so you can correct issues without partial imports.

### Coverage warnings

If no earnings history has been added for a UK employee, the holiday pay calculation falls back to basic salary. Coverboard surfaces this in two places:

- **Settings → Holiday pay earnings history** — an amber alert lists every employee missing earnings history with a deep link to **Add earnings history →**
- The team member's own profile shows an amber "No earnings history yet" empty state until at least one row is added

---

## Frequently asked questions

**Does this apply to all employees?**
The 52-week average applies to UK workers whose pay varies. Non-UK employees are not gated by these rules — Coverboard hides the section entirely outside the UK. For UK employees on a fixed salary with no overtime, commission, or variable pay, basic salary is already their normal pay — no earnings history is needed and the fallback warning is informational only.

**What if an employee has been with us less than 52 weeks?**
Coverboard uses however many paid weeks are available, up to 52. If an employee has 20 weeks of history, it averages over those 20 weeks.

**Does this apply to all holiday or just some of it?**
Strictly speaking, UK law requires normal pay for the first 4 weeks of statutory leave (the Working Time Directive element). The remaining 1.6 weeks can be paid at basic rate. In practice, most employers apply the same rate to all holiday to avoid complexity — Coverboard does the same by default.

**What about zero-hours workers?**
Zero-hours workers often have highly variable earnings. The 52-week average is especially important for them — it is also the legally required method following the Harpur Trust v Brazel Supreme Court ruling in 2022.

**Can the employee see their own holiday pay rate?**
Yes. From **Settings → Profile** every UK employee sees their own current daily holiday pay rate in a read-only summary card. They cannot see their colleagues' figures.

> The 52-week holiday pay calculator and earnings history are available on the **Scale** plan and above.

<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# Earnings history CSV import

Holiday pay for UK employees with variable pay must be calculated on a 52-week earnings average — see [Holiday pay — why it includes overtime](holiday-pay-overtime.md) for the legal background. Coverboard relies on you keeping each UK employee's weekly earnings on file. The CSV importer is the fastest way to get those rows in for the first time, or to backfill a chunk of weeks at once.

> This feature is only available for employees with a UK work location set on their profile. The earnings history section (and its CSV importer) appears on a team member's profile only when their **Work location** is United Kingdom (GB).

---

## Where to find it

**Team → click the member → Holiday pay earnings history → CSV import** (admins and managers).

The import box sits above the earnings table. From there you can:

- **Download template** — grab a working CSV with the right header row and a few example rows
- **Upload a file** — pick a `.csv` from your machine
- **Paste CSV content** — drop CSV text directly into the input

---

## CSV format

The file must have a header row. Required columns (exact names, case-insensitive):

| Column | Required | Notes |
|---|---|---|
| `week_starting` | Yes | `YYYY-MM-DD`. Must fall on a **Monday** — the importer enforces this. |
| `gross_earnings` | Yes (unless zero week) | Decimal in pounds — no currency symbol, no thousands separators. Max 1,000,000. Must be ≥ 0. |
| `hours_worked` | Yes | Number between 0 and 168. |
| `zero_pay_week` | Yes | `true`, `false`, `1`, `0`, `yes`, or `no`. When `true`, gross/hours are forced to 0 regardless of what's in the row. |

Extra columns are silently ignored, so you can hand-pick what to export from your payroll system.

A minimal valid file:

```
week_starting,gross_earnings,hours_worked,zero_pay_week
2026-01-05,650.00,37.5,false
2026-01-12,720.50,40.0,false
2026-01-19,0,0,true
2026-01-26,725.00,40.0,false
```

---

## How the importer behaves

When you submit the file, Coverboard parses it client-side first and shows a preview:

- **Valid rows** that will be inserted
- **Per-row errors** — invalid date format, date that isn't a Monday, missing required value, value out of range, etc., each tagged with the original row index
- **Intra-file duplicates** — the same `week_starting` listed twice in the same file
- **Existing-data conflicts** — `week_starting` dates that already exist for this employee. To change an existing week, edit the row in the table directly rather than re-importing.

You can fix the file and re-paste/upload as many times as you need — nothing is committed until you confirm.

On commit, all valid rows are inserted in one batch. The earnings history table refreshes with the new rows and the **Current average daily rate** at the top recalculates immediately.

---

## Pulling a CSV out of payroll

Most UK payroll systems (Sage, Xero, QuickBooks, BrightPay, IRIS, etc.) can produce a weekly earnings report by employee. The exact column names will be different from Coverboard's — that's fine. Either:

- Rename the columns to match Coverboard's `week_starting`, `gross_earnings`, `hours_worked`, `zero_pay_week` before importing, or
- Use a spreadsheet to map your columns into a new sheet, save as CSV, and import that

If the source system gives you a "Week ending" date instead of "Week starting", subtract 6 days when you map.

---

## Zero-pay weeks

A zero-pay week is one where the employee was on the books but earned nothing — unpaid leave, sickness without SSP, an unpaid sabbatical, etc.

These rows must still be imported (with `zero_pay_week,true`). The 52-week average **excludes** them automatically — but it needs to know they happened, otherwise the average gets stretched over too few real weeks and you risk over- or under-paying holiday.

---

## Tips

- **Keep weekly earnings up to date as you process payroll.** A monthly drop-in is easier than a one-off backfill of 52 weeks. Settings → Holiday pay earnings history flags any employee falling behind.
- **Imports are append-only.** To correct a single row, edit it in place from the table. To redo a whole period, delete the affected rows first.
- **The file is parsed client-side.** Sensitive earnings data only leaves the browser when you click commit, and only the validated rows are sent to the API.

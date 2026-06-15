<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# Bulk team member invitation

Adding team members one at a time is fine for a single new hire — but if you're standing up Coverboard for the first time, or onboarding a whole department, you'll want to invite people in batches. The bulk import tool takes a CSV (uploaded or pasted) and creates up to 100 team members in one go, sending each of them an invite email with a temporary password.

---

## Where to find it

**Team → Bulk import** (admins and managers).

You'll see a dialog titled **Bulk import team members** with two ways to get your data in:

- **Upload a CSV file** — pick a `.csv` from your machine
- **Paste CSV content** — drop CSV text directly into the textarea (handy when you're working from a Google Sheet or just have a few rows)

Either way, the data must be in the same shape — see below.

---

## CSV format

The first row must be a header. The following columns are recognised:

| Column | Required | Notes |
|---|---|---|
| `name` | Yes | Full name |
| `email` | Yes | Must be unique within your org and globally |
| `countryCode` | Yes | Two-letter ISO code (GB, NG, KE, BR, etc.) — drives default leave entitlement |
| `workCountry` | Yes | Where the person actually works. UK statutory features (SSP, holiday pay, Bradford) only apply when this is `GB`. |
| `role` | No | `ADMIN`, `MANAGER`, or `MEMBER`. Defaults to `MEMBER`. |
| `memberType` | No | `EMPLOYEE`, `CONTRACTOR`, or `FREELANCER`. Defaults to `EMPLOYEE`. |
| `employmentType` | No | `FULL_TIME`, `PART_TIME`, or `VARIABLE_HOURS`. Defaults to `FULL_TIME`. |
| `daysWorkedPerWeek` | No | Number 1–7. Defaults to 5. Drives pro-rata. |
| `fteRatio` | No | Decimal 0–1. Defaults to 1. |
| `department` | No | Free text. Used in compliance reports for grouping. |
| `rightToWorkVerified` | No | `yes`, `no`, or blank (unverified). Only meaningful for UK employees. |

A working template is available from the **Download template** link inside the dialog.

A minimal valid file looks like:

```
name,email,countryCode,workCountry
Alice Smith,alice@example.com,GB,GB
Bob Jones,bob@example.com,KE,KE
```

---

## What the importer does

Click **Preview** and Coverboard validates the file without writing anything to the database. The preview tells you:

- How many rows would be imported
- Which rows have field-level errors (with the row number, the field, and what's wrong)
- Whether you're trying to invite an email that already exists in any organisation
- Whether you'd exceed your plan's admin seat cap (Starter caps at 2 admins; Growth and above are unlimited)

If anything fails, fix the file and re-paste/upload — nothing is created until you commit. The same JSON endpoint also accepts `dryRun: true` if you're scripting against the API.

When you commit, Coverboard:

1. Creates each member in a single database transaction (so it's all-or-nothing)
2. Generates a random temporary password and stores the bcrypt hash
3. Sends each new member a welcome email with their temporary password and a link to sign in
4. Records a `team_member.bulk_imported` audit log entry plus one `team_member.created` entry per row, so the bulk import shows up cleanly in your audit trail
5. Suggests adding UK statutory leave types if you've just imported your first UK employee and don't have them set up yet

---

## Limits and pitfalls

- **100 rows per request.** For larger lists, split the file into chunks of 100. The cap is there to keep email delivery and database write latency predictable.
- **Email collisions block the whole batch.** If even one row has a duplicate or already-registered email, the request fails — fix the file and try again. Use Preview first to catch this without rolling back partial writes.
- **Admin seat caps apply.** If you're on Starter and try to bulk-import three admins, the whole batch is rejected with an upgrade prompt — drop or downgrade the offending rows, or move to Growth first.
- **Temporary passwords are sent in plaintext over email.** Members should change their password on first login from **Settings → Profile → Change password**.

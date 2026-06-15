<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# Right to work tracking

UK employers have a statutory duty to check that every employee has the right to work in the UK before they start, and to keep a record of that check. Failing to do so can result in a civil penalty of up to £60,000 per illegal worker, plus criminal liability in serious cases.

Coverboard does not perform the check itself — that's still your job, with the documents in front of you (or via an Identity Service Provider). What it does is record **whether** you've done the check for each UK employee, and surface anyone you haven't, so nothing slips through.

> This feature is only available for employees with a UK work location set on their profile. The Right to work report only includes employees whose **Work location** is United Kingdom (GB).

---

## Where it lives on the team profile

**Team → click the member → Right to work verified** (a yes/no/blank field).

Three values:

- **Yes** — you've checked the documents, the person is allowed to work in the UK
- **No** — you've explicitly recorded that the person does not have right to work (rare; usually triggers offboarding)
- **Blank / unverified** — no check has been recorded yet

The default for a new team member is unverified. The team page shows an amber "Unverified right to work" warning on any member card that's blank or set to No, so it's visible without drilling into the report.

The bulk import CSV accepts a `rightToWorkVerified` column with values `yes`, `no`, or blank — useful if you're importing a team you've already vetted offline.

---

## The report

**Reports → Right to work** (UK organisations only).

The tab shows every UK employee with their current status and an "Unverified" badge for anyone whose right to work hasn't been confirmed. A summary card at the top of Reports shows the count of unverified UK employees so it's the first thing you see.

Click the **Download** icon to export the report to CSV. Columns:

- `name`, `email`, `department`, `rightToWorkVerified`

The CSV is suitable for sharing with HR, an internal compliance team, or attaching to an audit trail document.

---

## What you should do

- **Verify before the start date** — UK law requires the check to be completed before the person begins work. Setting the field after the fact does not retroactively make you compliant.
- **Re-check before time-limited permission expires** — the field in Coverboard is a single yes/no without an expiry date. If you employ people on time-limited visas, store the expiry date in your HR system and diary the re-check separately.
- **Keep the original evidence** — Coverboard records *that* you've checked, not the document itself. Keep a copy of the document (or the IDSP report) in your HR document store for the duration of employment plus 2 years after.

> Right to work tracking is available on the **Growth** plan and above.

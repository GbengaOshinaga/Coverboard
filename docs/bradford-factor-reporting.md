<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# Bradford Factor reporting

The Bradford Factor is a long-standing way for HR teams to identify employees whose absence pattern — short, frequent spells — is more disruptive than a single long absence of the same total length. It's used by the NHS, lots of councils, and a fair number of private employers as the **trigger** for a return-to-work conversation, an absence review, or a referral to occupational health.

It is **not** a disciplinary tool on its own. The score tells you *who to look at*; the conversation tells you *why*.

> This feature is only available for employees with a UK work location set on their profile. Bradford Factor scores in Coverboard cover UK-based employees only — the report is hidden if you don't have any.

---

## How the score is calculated

The formula is **S² × D**, where:

- **S** = the number of separate sickness spells in the last 12 months
- **D** = the total number of sick days across all those spells in the last 12 months

The squaring is the whole point. Six one-day absences (S=6, D=6) score **216**. One six-day absence (S=1, D=6) scores **6**. The same total time off, very different operational impact.

Coverboard recalculates and stores the score on the user's profile (`User.bradfordScore`) automatically when an SSP-type request is created or approved, so the report you see is current as of the most recent sickness event.

---

## Where to find it

**Reports → Bradford Factor.**

The tab only appears if your org has at least one UK employee. If you've turned the report on but the table says "No UK employees found", check the **Work location** field on your team profiles — only employees whose work location is United Kingdom (GB) are included.

The report shows one row per UK employee, with:

- **Employee** — name
- **Spells** — sickness spells in the last 12 months (S)
- **Days** — total sick days in the last 12 months (D)
- **Score** — the calculated Bradford Factor (S² × D)
- **Status** — green "OK" badge if below the threshold, red "Above threshold" badge if at or above

A summary card at the top of the Reports page shows how many employees are currently above the threshold.

---

## The threshold

There is no statutory Bradford threshold — what counts as "high" is your call as an employer. Common rules of thumb:

- **50** — a polite informal chat is appropriate
- **125** — formal review meeting
- **200** — written warning under your absence policy
- **400** — final written warning territory

You set the threshold using the **Threshold** input above the table. Enter a number and click **Apply** — the table refilters and the summary count updates. The threshold is per-session, so each user can set what they want.

---

## CSV export

Click the **Download** icon next to the threshold to export the current view to CSV. The columns are:

- `name`, `spells`, `days`, `score`

Useful for sharing with HR, importing into your absence management system, or producing the figure for an annual report.

---

## Things to remember

- **Only sickness leave counts.** Annual leave, parental leave, compassionate leave and so on do not contribute to the score. Make sure your sickness leave type maps to the SSP/Sick category in Coverboard.
- **The 12-month window is rolling, not calendar.** An absence falls out of the score 12 months after it ended.
- **Don't act on the score in isolation.** A high score can be caused by a long-term medical condition, a disability, pregnancy-related illness, or a workplace issue — all of which need careful (and in some cases legally protected) handling. Use the score to start a conversation, not to skip it.
- **Pro-rata for part-timers is your judgement call.** Bradford does not natively account for working pattern; some employers normalise the score for part-time staff. Coverboard does not adjust the score by FTE — what you see is the raw S² × D for the days they were rostered.

> Bradford Factor reporting is available on the **Growth** plan and above.

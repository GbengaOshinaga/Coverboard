<!-- Last reviewed: 2026-05-11 — current defaults are the 2026/27 rates -->
# Annual statutory rate update (each April)

UK statutory pay rates change every tax year on **6 April**. Coverboard's SSP, SMP and SSP-eligibility calculations all read their weekly figures from environment variables with fallback defaults in code. Once a year, payroll needs to refresh those values so the calculator stays accurate.

**This page is for whoever runs payroll, not the on-call engineer.** No deployment is needed if you set the env vars in Vercel — the running app picks the new values up on the next invocation.

---

## TL;DR — the four env vars to set

| Variable | What it is | 2026/27 default in code |
|---|---|---|
| `SSP_WEEKLY_RATE` | Statutory Sick Pay weekly rate | `123.25` |
| `SMP_WEEKLY_RATE` | Statutory Maternity Pay flat weekly rate (also used for SAP/SPP/ShPP via the same flat rate) | `194.32` |
| `SMP_FLAT_RATE` | Optional alias for `SMP_WEEKLY_RATE` consumed by the SMP phase calculator — set either one. If both are set, `SMP_FLAT_RATE` wins. | `194.32` |
| `LEL_WEEKLY` | Lower Earnings Limit — employees with average weekly earnings below this floor are **not** entitled to SSP at all | `125` |

If you don't set these, the defaults above are used. The defaults are kept current in the code at release time, but Vercel env vars are the right place to update them annually so you're not waiting on a code deploy.

---

## Where to find the new rates each April

HMRC publishes the new tax-year rates in late winter / early spring before they take effect on 6 April.

- **SSP weekly rate** — https://www.gov.uk/employers-sick-pay
- **SMP/SAP/SPP/ShPP flat rate** — https://www.gov.uk/maternity-pay-leave/pay (and the equivalent paternity / adoption / shared parental pages)
- **Lower Earnings Limit (LEL)** — https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions (look for "Class 1 NICs lower earnings limit, primary threshold")

> The LEL is held for some tax years (it was £125 for both 2025/26 and 2026/27, for example). If HMRC publishes the same number, you can leave `LEL_WEEKLY` unchanged — but bump the "last reviewed" date in your records anyway so future-you knows it was actually checked.

---

## Step-by-step procedure

Do this once per tax year, in the few weeks before 6 April.

1. **Look up the new rates** at the three HMRC pages above. Write them down. You should end up with up to four numbers: the new SSP weekly rate, SMP flat rate, LEL, and your "as-of" date.
2. **Set the env vars in Vercel** (Project → Settings → Environment Variables → Production):
   - `SSP_WEEKLY_RATE` → new SSP rate (e.g. `125.85`)
   - `SMP_WEEKLY_RATE` → new SMP flat rate (e.g. `198.10`)
   - `LEL_WEEKLY` → new LEL (only if HMRC changed it)
   - Leave `SMP_FLAT_RATE` empty unless you have a specific reason to differ from `SMP_WEEKLY_RATE`.
3. **Redeploy** (Vercel → Deployments → Redeploy the latest). The new values are read on app startup; existing serverless invocations keep their old values until they recycle, so a manual redeploy is the deterministic path. (You can also just wait — most instances recycle within minutes.)
4. **Smoke-test** by creating a test SSP and a test SMP leave in a sandbox org. The API response from `POST /api/leave-requests` should show the new daily rate for SSP and the new phase 2 weekly rate for SMP.
5. **Update the code defaults** (engineering task — optional but recommended): bump the constants in `src/lib/uk-compliance.ts` and `src/lib/smpCalculator.ts` so a fresh deploy without env vars set still picks up the current year. PR title pattern: `chore: bump statutory rates to YYYY/YY`.
6. **Record the change** wherever your team tracks compliance updates (a single line — "2027-03-15: bumped SSP to 125.85, SMP to 198.10, LEL held at 125" — is enough).

---

## What can go wrong if you forget

- **SSP underpaid.** Sick employees get last year's daily rate, multiplied by their qualifying-days-per-week. For a 5-day-a-week employee on a 10-day sick spell, last year's £123.25 vs. a hypothetical £125.85 is roughly £5 per spell — small per case, but a tribunal claim if it's systematic.
- **SMP underpaid in phase 2.** Maternity pay between weeks 7 and 39 caps at the flat rate. A stale flat rate underpays every maternity payslip in that window.
- **LEL gate wrong.** A real-life borderline earner gets `eligible: false` against last year's threshold when they should qualify (or vice versa). This is the most visible failure mode if you're underpaying.

---

## Where the rates are read in code

For engineering reference, not payroll:

- `src/lib/uk-compliance.ts` — `DEFAULT_SSP_WEEKLY_RATE`, `DEFAULT_SMP_WEEKLY_RATE`, `DEFAULT_LEL_WEEKLY`. Exported as `UK_SSP_WEEKLY_RATE`, `UK_SMP_WEEKLY_RATE`, `UK_LEL_WEEKLY`.
- `src/lib/smpCalculator.ts` — `SMP_FLAT_RATE`, with the `SMP_FLAT_RATE` env var taking precedence over `SMP_WEEKLY_RATE`.
- Tests in `src/lib/uk-compliance.test.ts` skip the default-value assertions when env overrides are set, so CI is safe to run against either the defaults or your overrides.

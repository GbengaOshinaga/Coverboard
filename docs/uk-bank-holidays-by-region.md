<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# UK bank holidays by region

The UK doesn't have one set of bank holidays — it has three. England & Wales, Scotland, and Northern Ireland each have their own list, and they don't all line up. Easter Monday is a bank holiday in England, Wales and Northern Ireland but **not** Scotland; St Andrew's Day is a bank holiday in Scotland but nowhere else. If you treat them all the same, you will mis-calculate someone's leave entitlement somewhere.

Coverboard handles this by storing a separate set of bank holidays per region per organisation, and lets you pick which region your org uses.

---

## Picking your region

**Settings → UK Compliance → Bank holiday region.**

Three options:

- **England & Wales** (default)
- **Scotland**
- **Northern Ireland**

Pick the region your org operates from. If you have employees in more than one region, pick the one that matches the largest cohort or your registered office — Coverboard uses one region per organisation, not per employee.

---

## Two related settings

These sit alongside the region setting under **UK Compliance**:

- **Bank holiday inclusive** — when **on** (default), bank holidays count towards the 28-day annual leave entitlement (so an employee gets 20 days plus 8 bank holidays, totalling 28). When **off**, bank holidays are paid time off **on top of** the 28 days. The choice must match what your employment contracts say.
- **Carry-over** — independent of the region setting; controls whether unused annual leave can roll into the next year and how much.

---

## How the dates are populated

When your organisation is set up (during onboarding or by adding UK leave types later), Coverboard seeds the current calendar year and the next one with the correct bank holidays for **all three regions** — so switching region later is instant, no re-seed required.

Dates that move with Easter are calculated using Butcher's algorithm, so the seed works for any year you ask for — there is no end-of-data risk if your org runs into 2030 and beyond.

The dates seeded for each region:

**England & Wales** — New Year's Day, Good Friday, Easter Monday, Early May, Spring Bank, Summer Bank (last Monday in August), Christmas Day, Boxing Day.

**Scotland** — New Year's Day, 2 January, Good Friday, Early May, Spring Bank, Summer Bank (first Monday in August), St Andrew's Day, Christmas Day, Boxing Day. *No Easter Monday.*

**Northern Ireland** — New Year's Day, St Patrick's Day, Good Friday, Easter Monday, Early May, Spring Bank, Battle of the Boyne (Orangemen's Day), Summer Bank (last Monday in August), Christmas Day, Boxing Day.

When a bank holiday falls on a weekend, the substitute (Monday or Tuesday) is added — Coverboard handles the substitution automatically.

---

## What the region affects

The region you pick changes:

- Which dates show on the **team calendar** as bank holidays
- Whether a date counts as a "bank holiday" in cover warnings (cover warnings skip bank holidays — see [Regional workforce management](regional-workforce-management.md))
- The 28-day annual leave entitlement, when **Bank holiday inclusive** is on (the count of bank holidays differs by region)
- What gets seeded into the `BankHoliday` table for the year

It does **not** change SSP rates, holiday pay calculation, parental leave rules, or anything else statutory. Those apply UK-wide.

---

## Adding or removing custom holidays

If your organisation observes additional days (a company shutdown between Christmas and New Year, a local civic holiday) you can add them to the bank holidays table directly through the database for now — there's no UI yet for organisation-specific extras. They appear on the calendar like a real bank holiday and are excluded from cover warnings.

> Bank holiday region configuration is available on the **Growth** plan and above.

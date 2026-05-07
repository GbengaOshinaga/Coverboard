<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# Regional workforce management

Some teams have to keep a minimum number of people on the ground in a particular location at all times — a London office that needs at least three engineers on site, a Manchester depot that can't run with fewer than two drivers, a clinic that needs a nurse on every weekday. Regional workforce management lets you group team members by region, set a minimum cover level for each, and have Coverboard warn you the moment a leave request would drop you below it.

---

## Turning regions on

Regions are off by default. To enable them, go to **Settings → General** and enable **Regional workforce management**. You'll see a confirmation dialog explaining what it adds — region selection on team profiles and cover badges on the calendar.

Once enabled, the **Regions** tab appears under Settings (**Settings → Regions**) and a region picker appears on every team member profile.

You can turn regions off again at any time. Existing region assignments are preserved (so you can re-enable later) but cover warnings stop firing while the feature is off.

---

## Creating regions

A region is a named group with three pieces of metadata:

- **Name** — what people call this group (London Office, Site A, Pharmacy Counter). Must be unique within the organisation.
- **Description** — optional, free text. Useful for explaining what counts as "this region" if it's ambiguous.
- **Min cover** — the minimum number of region members who must be available on every weekday. This is the threshold cover warnings fire against. Must be at least 1.
- **Colour** — used on the team calendar to identify the region. Pick from a preset palette or set your own hex code.

Add a region under **Settings → Regions → Add region**. Each region is independent — a member can only belong to one region at a time, and changing their region creates a `UserRegionHistory` entry (so you have an audit trail of moves).

You can mark a region as inactive without deleting it (preserves history; cover warnings stop). Deleting a region unassigns its members from that region but does not delete the members.

---

## How cover warnings work

Cover is checked on every leave request — both at submission time and again when a manager approves it.

For each weekday in the requested date range, Coverboard:

1. Finds the requester's region
2. Counts how many other active region members are available that day (i.e. not on an approved leave for that date)
3. Compares the available count against the region's **Min cover**
4. If `available < min cover`, that day is flagged as a cover conflict

Weekends and bank holidays in the org's configured **UK bank holiday region** are skipped — the check is for working-day cover.

If any day falls below cover, the requester sees an inline warning explaining which days are short, by how many, and which colleagues are already off. Managers see the same warning at approval time and can either:

- **Cancel** and ask the requester to pick different dates, or
- **Override and approve anyway** — this is captured on the request as a `coverOverride` flag with the approver's id and timestamp, so you have a clear audit trail of who overrode the cover threshold and when

Members not assigned to a region, and any region marked inactive, do not generate cover warnings.

---

## Tips

**Set min cover for the worst-case shift.** If your London office can run on three people but really suffers on two, set min cover to 3. A warning beats a stretched team.

**Use descriptions to disambiguate.** "Manchester" might be obvious to your operations lead but not to a new hire. Spell out which roles or sites the region covers.

**Move people, don't recreate regions.** If someone changes location, edit their region from their team profile rather than deleting and recreating regions — the history table relies on region IDs to give you a clean trail.

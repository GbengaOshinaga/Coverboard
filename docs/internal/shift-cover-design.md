# Shift-aware cover — design (Phase 1+)

Status: **Phase 0 and Phase 1 built** (2026-09-30). Phases 2–3 not started.

Phase 1 as built differs from the sketch below in a few places:

- `minCoverByWeekday` is `Int[]` with `0` meaning "no minimum" (Prisma lists
  can't hold nulls). A shift with 0 and nobody scheduled isn't running.
- No rotation cycles yet (`cycleWeeks`/`cycleAnchor` dropped) — patterns are
  weekly. Revisit if interviews show rotating rotas are common.
- No `isActive` on ShiftType; deleting a shift cascades its patterns.
- In shift mode the region's `coverWeekends` flag is ignored (the weekday grid
  replaces it); `coverBankHolidays` still applies.
- The engine is `src/lib/shiftCover.ts` (pure, YYYY-MM-DD strings). The live
  check, dashboard, calendar and 13-week reports all use it. Legacy regions
  run through it as one implicit all-day shift.
- The requester's leave only conflicts on shifts they're scheduled for; with
  no pattern, the check reports `requesterScheduled: false` and no conflict.

## Why

Coverboard is positioned for shift-based businesses (care first, then
hospitality, pharmacy, retail). Today cover is one number per region per day
(`Region.minCover`), and "available" means *every region member not on
approved leave*. That can't express:

- different minimums per shift (days need 6, nights need 4);
- different minimums per weekday (weekends need more);
- whether someone was actually due to work (a Mon–Wed carer counts as
  available on Saturday);
- leave booked against a shift that crosses midnight.

## Non-goals

- A full rota / scheduling tool (dated shift assignments, open shifts, swaps,
  drag-and-drop). That is RotaCloud / Deputy / care-system territory; we model
  **recurring patterns** only.
- Time and attendance, clock-in, payroll hours capture.

## Data model

`Region` stays as the "team" (UI copy can move to "Team" later without a
schema rename).

```prisma
model ShiftType {
  id        String  @id @default(cuid())
  regionId  String
  name      String  // "Early", "Late", "Night"
  startTime String  // "07:00" (local, Europe/London)
  endTime   String  // "20:00"; endTime <= startTime means it ends next day
  // Minimum staff per weekday, index 0 = Monday … 6 = Sunday.
  // null entry = shift doesn't run that day.
  minCoverByWeekday Int?[]
  isActive  Boolean @default(true)
  sortOrder Int     @default(0)

  region   Region        @relation(fields: [regionId], references: [id], onDelete: Cascade)
  patterns WorkPattern[]

  @@unique([regionId, name])
}

model WorkPattern {
  id          String   @id @default(cuid())
  userId      String
  shiftTypeId String
  weekday     Int      // 0 = Monday … 6 = Sunday
  // Optional rotation: pattern applies every `cycleWeeks` weeks, starting
  // from the week of `cycleAnchor`. null = every week.
  cycleWeeks  Int?
  cycleAnchor DateTime? @db.Date
  effectiveFrom DateTime  @db.Date
  effectiveTo   DateTime? @db.Date

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  shiftType ShiftType @relation(fields: [shiftTypeId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([shiftTypeId, weekday])
}
```

`effectiveFrom/To` keeps history so past cover reports and holiday-pay
reference periods stay correct when a pattern changes.

## Cover calculation

For a region, date *d* and shift *s* running on *d*'s weekday:

```
scheduled(s, d) = users with an active WorkPattern for s on weekday(d)
                  whose cycle matches d
off(s, d)       = scheduled users with approved leave covering that shift
available       = |scheduled| − |off|
required        = s.minCoverByWeekday[weekday(d)]
```

- A shift belongs to the **date it starts on**. A Thu 20:00–Fri 08:00 night is
  "Thu night".
- Weekend / bank holiday handling: a shift with `null` for a weekday doesn't
  run; bank holidays use the region's `coverBankHolidays` flag (Phase 0).

`computeDailyCover` becomes `computeShiftCover` returning one row per
(date, shift). `DailyCover` is kept as a roll-up (worst shift that day) so the
widget, calendar and reports keep working during migration.

### Backwards compatibility

A region with **no ShiftTypes** behaves exactly as today: one implicit all-day
shift, everyone in the region scheduled, `required = minCover`, weekend/bank
holiday flags from Phase 0. Orgs opt in by adding shift types; nothing breaks
for existing customers.

## Leave against shifts (Phase 2)

- Leave stays date-ranged. For a scheduled user, the shifts affected are the
  pattern shifts that **start** within the range.
- Hours for irregular / zero-hours workers (`LeaveRequest.hoursBooked`) can be
  pre-filled from the pattern's shift lengths instead of typed.
- SSP qualifying days can be derived from the pattern (the weekdays the
  employee is scheduled) rather than `User.qualifyingDaysPerWeek`. Must keep
  the existing linked-spell and waiting-day logic intact; add tests before
  switching.

## Find cover (Phase 3)

For an under-covered (shift, date): list region members who are **not
scheduled** on that shift and **not on leave** that day, excluding anyone
already scheduled on an overlapping shift. Read-only suggestions first;
messaging / "ask to cover" later. Only now can marketing honestly say
"find cover".

## UI

- Settings → Regions → region → **Shifts** tab: add shift types with a
  7-column minimum grid.
- Team member profile → **Working pattern**: pick shifts per weekday.
- Dashboard widget: rows per region, expandable per shift ("Nights 3/4").
- Leave request + approval panel: show affected shifts instead of days.
- Calendar: per-day indicator = worst shift that day.

## Plan gating

Undecided. Phase 0 is on every plan with regions. Suggest shift types on
Growth+, "find cover" on Scale+ — confirm against `src/config/pricing.ts`
before building.

## Open questions (answer through the validation interviews first)

1. Do care homes think in day/night, or early/late/night? Does it vary by
   home?
2. Are staff patterns fixed, rotating (e.g. 2-week cycle), or different every
   week? If mostly "different every week", patterns don't fit and we'd need
   dated assignments (i.e. a rota) — re-evaluate scope.
3. Is minimum cover set per shift only, or also per role/skill (e.g. one
   medication-trained carer per shift)? Role requirements would be a separate
   `ShiftRequirement` model — out of scope for Phase 1.
4. Do they already have a rota tool they'd keep? If yes, importing patterns
   (CSV first) matters more than building an editor.

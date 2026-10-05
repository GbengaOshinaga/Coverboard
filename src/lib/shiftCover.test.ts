import test from "node:test";
import assert from "node:assert/strict";
import {
  computeShiftCover,
  weekdayIndex,
  worstShift,
  LEGACY_SHIFT_ID,
  type EngineInput,
  type EnginePattern,
  type EngineShift,
} from "./shiftCover";

const REGION = { minCover: 2, coverWeekends: true, coverBankHolidays: true };

const MEMBERS = [
  { id: "a", name: "Amara" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Cleo" },
  { id: "d", name: "Dev" },
];

// Mon 4 May 2026 … Sun 10 May 2026
const THU = "2026-05-07";
const SAT = "2026-05-09";

const DAY: EngineShift = {
  id: "day",
  name: "Day",
  startTime: "08:00",
  endTime: "20:00",
  minCoverByWeekday: [2, 2, 2, 2, 2, 3, 3],
};
const NIGHT: EngineShift = {
  id: "night",
  name: "Night",
  startTime: "20:00",
  endTime: "08:00",
  minCoverByWeekday: [1, 1, 1, 2, 2, 0, 0],
};

function pattern(
  userId: string,
  shiftTypeId: string,
  weekday: number,
  effectiveFrom = "2026-01-01",
  effectiveTo: string | null = null
): EnginePattern {
  return { userId, shiftTypeId, weekday, effectiveFrom, effectiveTo };
}

function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    region: REGION,
    shifts: [],
    patterns: [],
    members: MEMBERS,
    leavesByUser: new Map(),
    bankHolidayDates: new Set(),
    days: [THU],
    ...overrides,
  };
}

test("weekdayIndex is Monday-first", () => {
  assert.equal(weekdayIndex("2026-05-04"), 0);
  assert.equal(weekdayIndex(THU), 3);
  assert.equal(weekdayIndex("2026-05-10"), 6);
});

test("legacy mode: one all-day shift with every member scheduled", () => {
  const [day] = computeShiftCover(
    input({
      leavesByUser: new Map([["a", [{ start: THU, end: THU, leaveTypeName: "Sick" }]]]),
    })
  );
  assert.equal(day.shifts.length, 1);
  const s = day.shifts[0];
  assert.equal(s.shiftId, LEGACY_SHIFT_ID);
  assert.equal(s.required, 2);
  assert.equal(s.available, 3);
  assert.deepEqual(s.staffOff, [{ id: "a", name: "Amara", leaveType: "Sick" }]);
});

test("legacy mode: weekend follows the region's coverWeekends flag", () => {
  const [checked] = computeShiftCover(input({ days: [SAT] }));
  assert.equal(checked.shifts[0].coverRequired, true);

  const [skipped] = computeShiftCover(
    input({ days: [SAT], region: { ...REGION, coverWeekends: false } })
  );
  assert.equal(skipped.shifts[0].coverRequired, false);
});

test("shift mode: only people scheduled on the shift count towards it", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT],
      patterns: [
        pattern("a", "day", 3),
        pattern("b", "day", 3),
        pattern("c", "night", 3),
        pattern("d", "night", 3),
      ],
      leavesByUser: new Map([["d", [{ start: THU, end: THU, leaveTypeName: "Sick" }]]]),
    })
  );
  const night = day.shifts.find((s) => s.shiftId === "night")!;
  assert.equal(night.required, 2);
  assert.equal(night.available, 1);
  assert.deepEqual(night.staffAvailable, [{ id: "c", name: "Cleo" }]);

  const dayShift = day.shifts.find((s) => s.shiftId === "day")!;
  assert.equal(dayShift.available, 2);
  assert.equal(dayShift.required, 2);
});

test("shift mode: per-weekday minimums replace the weekend flag", () => {
  const [sat] = computeShiftCover(
    input({
      days: [SAT],
      region: { ...REGION, coverWeekends: false },
      shifts: [DAY, NIGHT],
      patterns: [pattern("a", "day", 5)],
    })
  );
  // Day has a Saturday minimum, so it's enforced despite coverWeekends=false;
  // Night has no Saturday minimum and nobody on it, so it isn't running.
  assert.deepEqual(
    sat.shifts.map((s) => [s.shiftId, s.coverRequired]),
    [["day", true]]
  );
});

test("shift mode: bank holidays follow coverBankHolidays", () => {
  const args = {
    shifts: [DAY],
    patterns: [pattern("a", "day", 3)],
    bankHolidayDates: new Set([THU]),
  };
  const [on] = computeShiftCover(input(args));
  assert.equal(on.shifts[0].coverRequired, true);

  const [off] = computeShiftCover(
    input({ ...args, region: { ...REGION, coverBankHolidays: false } })
  );
  assert.equal(off.shifts[0].coverRequired, false);
});

test("shift mode: patterns only apply inside their effective dates", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY],
      patterns: [
        pattern("a", "day", 3, "2026-01-01", "2026-05-06"), // ended the day before
        pattern("b", "day", 3, "2026-05-08"), // starts the day after
        pattern("c", "day", 3, "2026-05-07"), // starts that day
      ],
    })
  );
  assert.deepEqual(day.shifts[0].scheduledUserIds, ["c"]);
});

test("shift mode: patterns for people outside the member list are ignored", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY],
      patterns: [pattern("a", "day", 3), pattern("moved-away", "day", 3)],
    })
  );
  assert.deepEqual(day.shifts[0].scheduledUserIds, ["a"]);
});

test("worstShift picks the enforced shift with the smallest margin", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT],
      patterns: [
        pattern("a", "day", 3),
        pattern("b", "day", 3),
        pattern("c", "night", 3),
      ],
    })
  );
  // Day 2/2 (margin 0), Night 1/2 (margin −1)
  assert.equal(worstShift(day)?.shiftId, "night");
});

test("days before a shift's activeFrom use the region's per-day rule", () => {
  const days = computeShiftCover(
    input({
      days: ["2026-05-06", THU],
      shifts: [{ ...DAY, activeFrom: THU }],
      patterns: [pattern("a", "day", 2), pattern("a", "day", 3)],
    })
  );
  // Wed: shift not set up yet → legacy all-day, everyone counts, min 2.
  assert.equal(days[0].shifts[0].shiftId, LEGACY_SHIFT_ID);
  assert.equal(days[0].shifts[0].available, 4);
  // Thu: shift mode, only Amara scheduled.
  assert.equal(days[1].shifts[0].shiftId, "day");
  assert.deepEqual(days[1].shifts[0].scheduledUserIds, ["a"]);
});

test("cover candidates: free, rested members are suggested for a short shift", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT],
      patterns: [pattern("a", "day", 3), pattern("b", "day", 3), pattern("c", "night", 3)],
      leavesByUser: new Map([["b", [{ start: THU, end: THU, leaveTypeName: "Annual" }]]]),
    })
  );
  const dayShift = day.shifts.find((s) => s.shiftId === "day")!;
  // Ben is on leave, Amara is already on it, Cleo works the night straight
  // after (no gap) — only Dev is free.
  assert.deepEqual(dayShift.coverCandidates, [
    { id: "d", name: "Dev", employmentType: null, weekHours: 0 },
  ]);
  // Ben is rostered on the shift, so he's in staffOff, not ruledOut.
  assert.deepEqual(dayShift.ruledOut, [
    { id: "c", name: "Cleo", reason: "rest", note: "Night shift from 20:00" },
  ]);
});

test("cover candidates: empty when the shift is not short", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY],
      patterns: [pattern("a", "day", 3), pattern("b", "day", 3)],
    })
  );
  assert.deepEqual(day.shifts[0].coverCandidates, []);
});

test("cover candidates: respect 11h rest across adjacent days", () => {
  // Thu night (20:00–08:00) needs 2; only Dev is on it.
  const LATE: EngineShift = {
    id: "late",
    name: "Late",
    startTime: "14:00",
    endTime: "22:00",
    minCoverByWeekday: [0, 0, 0, 0, 0, 0, 0],
  };
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT, LATE],
      patterns: [
        pattern("d", "night", 3),
        pattern("a", "night", 2), // Wed night ends Thu 08:00 — 12h rest, OK
        pattern("b", "day", 4), // Fri day starts 08:00 — no rest, excluded
        pattern("c", "late", 4), // Fri late starts 14:00 — 6h rest, excluded
      ],
    })
  );
  const night = day.shifts.find((s) => s.shiftId === "night")!;
  assert.equal(night.available, 1);
  assert.deepEqual(night.coverCandidates, [
    { id: "a", name: "Amara", employmentType: null, weekHours: 12 },
  ]);
  assert.deepEqual(night.ruledOut, [
    { id: "b", name: "Ben", reason: "rest", note: "Day shift from 08:00 the next day" },
    { id: "c", name: "Cleo", reason: "rest", note: "Late shift from 14:00 the next day" },
  ]);
});

test("cover candidates: never in legacy mode", () => {
  const [day] = computeShiftCover(
    input({
      region: { ...REGION, minCover: 4 },
      leavesByUser: new Map([["a", [{ start: THU, end: THU, leaveTypeName: "Sick" }]]]),
    })
  );
  assert.equal(day.shifts[0].available, 3);
  assert.deepEqual(day.shifts[0].coverCandidates, []);
});

test("cover candidates: carry the member's contract type", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY],
      patterns: [pattern("a", "day", 3)],
      members: [
        { id: "a", name: "Amara" },
        { id: "z", name: "Zoe", employmentType: "ZERO_HOURS" },
      ],
    })
  );
  assert.deepEqual(day.shifts[0].coverCandidates, [
    { id: "z", name: "Zoe", employmentType: "ZERO_HOURS", weekHours: 0 },
  ]);
});

test("ruled out: names the clashing shift the day before", () => {
  // Thu day (08:00–20:00) is short. Ben worked Wed night until Thu 08:00;
  // Cleo worked a Wed late until 23:00 (9h rest).
  const LATE: EngineShift = {
    id: "late",
    name: "Late",
    startTime: "15:00",
    endTime: "23:00",
    minCoverByWeekday: [0, 0, 0, 0, 0, 0, 0],
  };
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT, LATE],
      patterns: [
        pattern("a", "day", 3),
        pattern("b", "night", 2),
        pattern("c", "late", 2),
      ],
    })
  );
  const dayShift = day.shifts.find((s) => s.shiftId === "day")!;
  assert.deepEqual(dayShift.ruledOut, [
    { id: "b", name: "Ben", reason: "rest", note: "Night shift until 08:00" },
    { id: "c", name: "Cleo", reason: "rest", note: "Late shift until 23:00 the day before" },
  ]);
  assert.deepEqual(dayShift.coverCandidates, [
    { id: "d", name: "Dev", employmentType: null, weekHours: 0 },
  ]);
});

test("ruled out: empty when the shift is not short", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY],
      patterns: [pattern("a", "day", 3), pattern("b", "day", 3)],
      leavesByUser: new Map([["c", [{ start: THU, end: THU, leaveTypeName: "Annual" }]]]),
    })
  );
  assert.deepEqual(day.shifts[0].ruledOut, []);
});

test("ruled out: off-rota members on leave say so", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY],
      patterns: [pattern("a", "day", 3)],
      leavesByUser: new Map([["b", [{ start: THU, end: THU, leaveTypeName: "Annual" }]]]),
    })
  );
  assert.deepEqual(day.shifts[0].ruledOut, [
    { id: "b", name: "Ben", reason: "on_leave", note: null },
  ]);
});

test("cover candidates: week hours count scheduled shifts Mon–Sun, minus leave", () => {
  // Thu day is short. Zoe works Mon + Tue days and Sun night that week, and
  // the following Mon day (next week, not counted). She's on leave Tue.
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT],
      patterns: [
        pattern("a", "day", 3),
        pattern("z", "day", 0),
        pattern("z", "day", 1),
        pattern("z", "night", 6),
      ],
      members: [
        { id: "a", name: "Amara" },
        { id: "z", name: "Zoe" },
      ],
      leavesByUser: new Map([["z", [{ start: "2026-05-05", end: "2026-05-05", leaveTypeName: "Annual" }]]]),
    })
  );
  // Mon 12h + Sun night 12h; Tue skipped for leave.
  assert.equal(day.shifts.find((s) => s.shiftId === "day")!.coverCandidates[0].weekHours, 24);
});

test("assignments: an accepted cover offer puts someone on the shift", () => {
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT],
      patterns: [pattern("a", "day", 3)],
      assignments: [{ userId: "d", shiftTypeId: "day", date: THU }],
    })
  );
  const dayShift = day.shifts.find((s) => s.shiftId === "day")!;
  assert.equal(dayShift.available, 2);
  assert.deepEqual(dayShift.scheduledUserIds.sort(), ["a", "d"]);
  // Now covered (2/2 on Thu), so no candidates are needed.
  assert.deepEqual(dayShift.coverCandidates, []);
});

test("assignments: count towards rest for other shifts", () => {
  // Dev covers Thu day (08:00–20:00); Thu night is short, but Dev can't
  // go straight onto it.
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT],
      patterns: [pattern("a", "night", 3)],
      assignments: [{ userId: "d", shiftTypeId: "day", date: THU }],
    })
  );
  const night = day.shifts.find((s) => s.shiftId === "night")!;
  assert.ok(night.ruledOut.some((o) => o.id === "d" && o.reason === "rest"));
});

test("ruled out: a clash with accepted cover says so", () => {
  // Dev covers Thu day; Thu night is short. Dev is out because of the cover
  // shift he accepted, not his own pattern.
  const [day] = computeShiftCover(
    input({
      shifts: [DAY, NIGHT],
      patterns: [pattern("a", "night", 3)],
      assignments: [{ userId: "d", shiftTypeId: "day", date: THU }],
    })
  );
  const night = day.shifts.find((s) => s.shiftId === "night")!;
  const dev = night.ruledOut.find((o) => o.id === "d")!;
  assert.equal(dev.coverClash, true);
  assert.equal(dev.note, "Covering Day shift until 20:00");
});

test("cover candidates: flagged when the shift would take them past 48 hours that week", () => {
  // Thu day (12h) is short. Chloe works Mon, Tue, Wed and Sat days: 48h.
  // Covering would make 60h. Zoe works one day: 12h → 24h, no flag.
  const [day] = computeShiftCover(
    input({
      shifts: [DAY],
      patterns: [
        pattern("a", "day", 3),
        pattern("c", "day", 0),
        pattern("c", "day", 1),
        pattern("c", "day", 2),
        pattern("c", "day", 5),
        pattern("z", "day", 0),
      ],
      members: [
        { id: "a", name: "Amara" },
        { id: "c", name: "Chloe" },
        { id: "z", name: "Zoe" },
      ],
    })
  );
  const candidates = day.shifts[0].coverCandidates;
  const chloe = candidates.find((c) => c.id === "c")!;
  const zoe = candidates.find((c) => c.id === "z")!;
  // Still a candidate: the legal limit is a 17-week average, so it's a warning.
  assert.equal(chloe.weekHours, 48);
  assert.equal(chloe.hoursIfCovered, 60);
  assert.equal("hoursIfCovered" in zoe, false);
});

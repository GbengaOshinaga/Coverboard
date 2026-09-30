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

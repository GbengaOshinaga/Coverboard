import test from "node:test";
import assert from "node:assert/strict";
import {
  checkRegionalCoverPure,
  isValidHexColor,
  pickPresetColor,
  REGION_PRESET_COLORS,
} from "./regionCover";

const REGION = {
  id: "region-1",
  name: "London",
  minCover: 2,
  isActive: true,
  coverWeekends: false,
  coverBankHolidays: false,
};

function local(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function range(
  y1: number,
  m1: number,
  d1: number,
  y2: number,
  m2: number,
  d2: number
) {
  return { start: local(y1, m1, d1), end: local(y2, m2, d2) };
}

const utc = local;
void utc;

test("checkRegionalCoverPure: no conflict when enough staff available", () => {
  const r = range(2026, 5, 4, 2026, 5, 5); // Mon-Tue
  const result = checkRegionalCoverPure({
    region: REGION,
    employeeRegionId: REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
    approvedLeavesByUser: new Map(),
    bankHolidayDates: new Set(),
  });
  assert.equal(result.hasConflict, false);
  assert.equal(result.conflicts.length, 0);
});

test("checkRegionalCoverPure: conflict on a single day", () => {
  const r = range(2026, 5, 4, 2026, 5, 5); // Mon-Tue
  const result = checkRegionalCoverPure({
    region: REGION,
    employeeRegionId: REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    approvedLeavesByUser: new Map([
      [
        "a",
        [
          {
            start: "2026-05-04",
            end: "2026-05-04",
            leaveTypeName: "Annual",
          },
        ],
      ],
    ]),
    bankHolidayDates: new Set(),
  });
  assert.equal(result.hasConflict, true);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].date, "2026-05-04");
  assert.equal(result.conflicts[0].available, 1);
  assert.equal(result.conflicts[0].required, 2);
  assert.equal(result.conflicts[0].shortfall, 1);
  assert.equal(result.conflicts[0].staffOff[0].name, "A");
  assert.equal(result.conflicts[0].staffOff[0].leaveType, "Annual");
});

test("checkRegionalCoverPure: conflict on multiple days", () => {
  const r = range(2026, 5, 4, 2026, 5, 6); // Mon-Wed
  const result = checkRegionalCoverPure({
    region: REGION,
    employeeRegionId: REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    approvedLeavesByUser: new Map([
      [
        "a",
        [
          {
            start: "2026-05-04",
            end: "2026-05-06",
            leaveTypeName: "Annual",
          },
        ],
      ],
    ]),
    bankHolidayDates: new Set(),
  });
  assert.equal(result.hasConflict, true);
  assert.equal(result.conflicts.length, 3);
  assert.deepEqual(
    result.conflicts.map((c) => c.date),
    ["2026-05-04", "2026-05-05", "2026-05-06"]
  );
});

test("checkRegionalCoverPure: no conflict when employee is unassigned", () => {
  const r = range(2026, 5, 4, 2026, 5, 5);
  const result = checkRegionalCoverPure({
    region: null,
    employeeRegionId: null,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [],
    approvedLeavesByUser: new Map(),
    bankHolidayDates: new Set(),
  });
  assert.equal(result.hasConflict, false);
  assert.equal(result.regionId, null);
});

test("checkRegionalCoverPure: bank holidays excluded from conflict check", () => {
  // 2026-05-04 is a Monday — pretend it's a UK bank holiday.
  const r = range(2026, 5, 4, 2026, 5, 5); // Mon-Tue
  const result = checkRegionalCoverPure({
    region: REGION,
    employeeRegionId: REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [{ id: "a", name: "A" }], // only 1 member, would conflict
    approvedLeavesByUser: new Map(),
    bankHolidayDates: new Set(["2026-05-04"]),
  });
  // Tuesday should still flag — only the bank-holiday Monday is skipped.
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].date, "2026-05-05");
});

test("checkRegionalCoverPure: weekends excluded from conflict check", () => {
  // Sat 2026-05-02, Sun 2026-05-03 — would conflict on counts, but skipped.
  const r = range(2026, 5, 2, 2026, 5, 3);
  const result = checkRegionalCoverPure({
    region: REGION,
    employeeRegionId: REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [{ id: "a", name: "A" }], // only 1 member
    approvedLeavesByUser: new Map(),
    bankHolidayDates: new Set(),
  });
  assert.equal(result.hasConflict, false);
});

test("checkRegionalCoverPure: inactive region returns no conflict", () => {
  const r = range(2026, 5, 4, 2026, 5, 5);
  const result = checkRegionalCoverPure({
    region: { ...REGION, isActive: false },
    employeeRegionId: REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [],
    approvedLeavesByUser: new Map(),
    bankHolidayDates: new Set(),
  });
  assert.equal(result.hasConflict, false);
});

test("checkRegionalCoverPure: counts only the requesting employee's coworkers", () => {
  // members[] arrives pre-filtered to exclude the requesting employee. If
  // every coworker is on leave, that should still flag a conflict.
  const r = range(2026, 5, 4, 2026, 5, 4);
  const result = checkRegionalCoverPure({
    region: REGION,
    employeeRegionId: REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    approvedLeavesByUser: new Map([
      [
        "a",
        [
          {
            start: "2026-05-04",
            end: "2026-05-04",
            leaveTypeName: "Sick",
          },
        ],
      ],
    ]),
    bankHolidayDates: new Set(),
  });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].available, 1);
});

test("isValidHexColor: 6-digit hex passes, others fail", () => {
  assert.equal(isValidHexColor("#3B82F6"), true);
  assert.equal(isValidHexColor("#abcdef"), true);
  assert.equal(isValidHexColor("#ABC"), false);
  assert.equal(isValidHexColor("3B82F6"), false);
  assert.equal(isValidHexColor("#GGGGGG"), false);
  assert.equal(isValidHexColor(""), false);
});

test("pickPresetColor: cycles through 8 presets deterministically", () => {
  assert.equal(pickPresetColor(0), REGION_PRESET_COLORS[0]);
  assert.equal(pickPresetColor(7), REGION_PRESET_COLORS[7]);
  assert.equal(pickPresetColor(8), REGION_PRESET_COLORS[0]);
  assert.equal(pickPresetColor(15), REGION_PRESET_COLORS[7]);
});

// ---------- weekend / bank holiday cover ----------

function weekendRangeInput(
  region: typeof REGION,
  bankHolidayDates: Set<string> = new Set()
) {
  // Fri 8 – Mon 11 May 2026; A is off the whole range so only B is available.
  const r = range(2026, 5, 8, 2026, 5, 11);
  return {
    region,
    employeeRegionId: region.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    approvedLeavesByUser: new Map([
      [
        "a",
        [
          {
            start: "2026-05-08",
            end: "2026-05-11",
            leaveTypeName: "Annual Leave",
          },
        ],
      ],
    ]),
    bankHolidayDates,
  };
}

test("checkRegionalCoverPure: weekday-only region skips Sat/Sun", () => {
  const result = checkRegionalCoverPure(weekendRangeInput(REGION));
  assert.deepEqual(
    result.conflicts.map((c) => c.date),
    ["2026-05-08", "2026-05-11"]
  );
});

test("checkRegionalCoverPure: coverWeekends flags Sat/Sun shortfalls", () => {
  const result = checkRegionalCoverPure(
    weekendRangeInput({ ...REGION, coverWeekends: true })
  );
  assert.deepEqual(
    result.conflicts.map((c) => c.date),
    ["2026-05-08", "2026-05-09", "2026-05-10", "2026-05-11"]
  );
});

test("checkRegionalCoverPure: bank holiday skipped unless coverBankHolidays", () => {
  const bankHoliday = new Set(["2026-05-11"]);
  const skipped = checkRegionalCoverPure(
    weekendRangeInput({ ...REGION, coverWeekends: true }, bankHoliday)
  );
  assert.equal(
    skipped.conflicts.some((c) => c.date === "2026-05-11"),
    false
  );

  const checked = checkRegionalCoverPure(
    weekendRangeInput(
      { ...REGION, coverWeekends: true, coverBankHolidays: true },
      bankHoliday
    )
  );
  assert.equal(
    checked.conflicts.some((c) => c.date === "2026-05-11"),
    true
  );
});

// ---------- shift-aware cover ----------

const SHIFT_REGION = { ...REGION, coverWeekends: true, coverBankHolidays: true };
const NIGHT_SHIFT = {
  id: "night",
  name: "Night",
  startTime: "20:00",
  endTime: "08:00",
  minCoverByWeekday: [2, 2, 2, 2, 2, 2, 2],
};

function nightPattern(userId: string, weekday: number) {
  return {
    userId,
    shiftTypeId: "night",
    weekday,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
  };
}

test("checkRegionalCoverPure (shifts): conflict names the shift the requester works", () => {
  const r = range(2026, 5, 7, 2026, 5, 8); // Thu-Fri
  const result = checkRegionalCoverPure({
    region: SHIFT_REGION,
    employeeRegionId: SHIFT_REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    approvedLeavesByUser: new Map(),
    bankHolidayDates: new Set(),
    shifts: [NIGHT_SHIFT],
    // emp-1 and A work Thursday nights; B works Friday nights only.
    patterns: [nightPattern("emp-1", 3), nightPattern("a", 3), nightPattern("b", 4)],
  });
  assert.equal(result.usesShifts, true);
  assert.equal(result.requesterScheduled, true);
  // Thursday night drops to 1 of 2. Friday isn't flagged: emp-1 doesn't work it.
  assert.deepEqual(
    result.conflicts.map((c) => [c.date, c.shiftName, c.available, c.required]),
    [["2026-05-07", "Night", 1, 2]]
  );
});

test("checkRegionalCoverPure (shifts): no working pattern means no impact", () => {
  const r = range(2026, 5, 7, 2026, 5, 8);
  const result = checkRegionalCoverPure({
    region: SHIFT_REGION,
    employeeRegionId: SHIFT_REGION.id,
    employeeId: "emp-1",
    start: r.start,
    end: r.end,
    members: [{ id: "a", name: "A" }],
    approvedLeavesByUser: new Map(),
    bankHolidayDates: new Set(),
    shifts: [NIGHT_SHIFT],
    patterns: [nightPattern("a", 3)],
  });
  assert.equal(result.hasConflict, false);
  assert.equal(result.requesterScheduled, false);
});

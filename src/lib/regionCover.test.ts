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
            startDate: utc(2026, 5, 4),
            endDate: utc(2026, 5, 4),
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
            startDate: utc(2026, 5, 4),
            endDate: utc(2026, 5, 6),
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
            startDate: utc(2026, 5, 4),
            endDate: utc(2026, 5, 4),
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

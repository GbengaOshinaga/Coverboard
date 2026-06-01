import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAbsenceTrends,
  type UserForTrend,
  type SicknessLeaveForTrend,
} from "./absence-trends";

const NOW = new Date("2026-06-15T12:00:00Z");

const users: UserForTrend[] = [
  { id: "u1", name: "Alice", bradfordScore: 60 },
  { id: "u2", name: "Bob", bradfordScore: 0 },
];

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

test("returns 12 months by default, oldest first, with exactly 12 entries per user", () => {
  const out = computeAbsenceTrends(
    users,
    [
      {
        userId: "u1",
        startDate: utc(2026, 5, 4),
        endDate: utc(2026, 5, 6),
      },
    ],
    { now: NOW }
  );
  assert.equal(out.length, 1);
  const alice = out[0]!;
  assert.equal(alice.monthlySeries.length, 12);
  // First entry is July 2025 (June 2026 minus 11 months); last is June 2026.
  assert.equal(alice.monthlySeries[0]!.monthKey, "2025-07");
  assert.equal(alice.monthlySeries[11]!.monthKey, "2026-06");
});

test("a single in-month leave credits the right month and increments its spell count", () => {
  const out = computeAbsenceTrends(
    users,
    [
      {
        userId: "u1",
        startDate: utc(2026, 5, 4), // Mon
        endDate: utc(2026, 5, 6), // Wed — 3 working days
      },
    ],
    { now: NOW }
  );
  const alice = out[0]!;
  const may = alice.monthlySeries.find((m) => m.monthKey === "2026-05")!;
  assert.equal(may.days, 3);
  assert.equal(may.spells, 1);
  assert.equal(alice.totalDaysLast12Months, 3);
  assert.equal(alice.totalSpellsLast12Months, 1);
});

test("a leave spanning month boundary splits days across months but counts as one spell (in the start month)", () => {
  const out = computeAbsenceTrends(
    users,
    [
      {
        // 27 Apr (Mon) → 8 May (Fri). Crosses Apr/May.
        userId: "u1",
        startDate: utc(2026, 4, 27),
        endDate: utc(2026, 5, 8),
      },
    ],
    { now: NOW }
  );
  const alice = out[0]!;
  const apr = alice.monthlySeries.find((m) => m.monthKey === "2026-04")!;
  const may = alice.monthlySeries.find((m) => m.monthKey === "2026-05")!;
  // 27, 28, 29, 30 April = 4 weekdays
  assert.equal(apr.days, 4);
  // 1 May (Fri) + 4–8 May = total 6 weekdays
  assert.equal(may.days, 6);
  // Spell counted once, in the start month
  assert.equal(apr.spells, 1);
  assert.equal(may.spells, 0);
});

test("ignores leaves that ended before the trailing 12-month window", () => {
  const out = computeAbsenceTrends(
    users,
    [
      {
        userId: "u1",
        startDate: utc(2024, 1, 4),
        endDate: utc(2024, 1, 6),
      },
    ],
    { now: NOW }
  );
  // No row created when user has no in-window sickness.
  assert.equal(out.length, 0);
});

test("ignores leaves for users that are not in the supplied user set", () => {
  const out = computeAbsenceTrends(
    users,
    [
      {
        userId: "u_unknown",
        startDate: utc(2026, 5, 4),
        endDate: utc(2026, 5, 6),
      },
    ],
    { now: NOW }
  );
  assert.equal(out.length, 0);
});

test("direction is +1 when sickness is heavier in the second half of the window", () => {
  const out = computeAbsenceTrends(
    users,
    [
      // 3 leaves in Q4 of the trailing window, none earlier
      { userId: "u1", startDate: utc(2026, 4, 6), endDate: utc(2026, 4, 8) },
      { userId: "u1", startDate: utc(2026, 5, 4), endDate: utc(2026, 5, 6) },
      { userId: "u1", startDate: utc(2026, 6, 1), endDate: utc(2026, 6, 3) },
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.direction, 1);
});

test("direction is -1 when sickness was heavier in the first half", () => {
  const out = computeAbsenceTrends(
    users,
    [
      // 2 leaves in July-August 2025
      { userId: "u1", startDate: utc(2025, 7, 7), endDate: utc(2025, 7, 9) },
      { userId: "u1", startDate: utc(2025, 8, 4), endDate: utc(2025, 8, 6) },
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.direction, -1);
});

test("direction is 0 when first and second halves have identical absence days", () => {
  const out = computeAbsenceTrends(
    users,
    [
      { userId: "u1", startDate: utc(2025, 9, 1), endDate: utc(2025, 9, 1) },
      { userId: "u1", startDate: utc(2026, 3, 2), endDate: utc(2026, 3, 2) },
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.direction, 0);
});

test("output is sorted by totalDaysLast12Months descending — worst offenders first", () => {
  const out = computeAbsenceTrends(
    [
      { id: "u1", name: "Alice", bradfordScore: 0 },
      { id: "u2", name: "Bob", bradfordScore: 0 },
    ],
    [
      { userId: "u1", startDate: utc(2026, 5, 4), endDate: utc(2026, 5, 4) },
      { userId: "u2", startDate: utc(2026, 4, 6), endDate: utc(2026, 4, 10) },
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.name, "Bob");
  assert.equal(out[1]!.name, "Alice");
});

test("preserves the user's current bradfordScore so the UI can show the snapshot alongside the trend", () => {
  const out = computeAbsenceTrends(
    [{ id: "u1", name: "Alice", bradfordScore: 250.5 }],
    [{ userId: "u1", startDate: utc(2026, 5, 4), endDate: utc(2026, 5, 4) }],
    { now: NOW }
  );
  assert.equal(out[0]!.currentBradfordScore, 250.5);
});

test("monthsBack option controls the window size and respects oldest-first ordering", () => {
  const out = computeAbsenceTrends(
    users,
    [{ userId: "u1", startDate: utc(2026, 5, 4), endDate: utc(2026, 5, 4) }],
    { now: NOW, monthsBack: 6 }
  );
  assert.equal(out[0]!.monthlySeries.length, 6);
  assert.equal(out[0]!.monthlySeries[0]!.monthKey, "2026-01");
  assert.equal(out[0]!.monthlySeries[5]!.monthKey, "2026-06");
});

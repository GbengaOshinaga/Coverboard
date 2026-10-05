import test from "node:test";
import assert from "node:assert/strict";
import {
  countWorkingDays,
  prorateForStartDate,
  resolveWorkingWeek,
  weekdaysFromPatterns,
  weeksToWorkingDays,
} from "./working-week";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const pat = (weekday: number, from = "2026-01-01", to: string | null = null) => ({
  weekday,
  effectiveFrom: d(from),
  effectiveTo: to ? d(to) : null,
});

test("weekdaysFromPatterns: distinct active weekdays", () => {
  // Mon, Wed, Fri (two shifts on Wednesday).
  assert.deepEqual(weekdaysFromPatterns([pat(4), pat(0), pat(2), pat(2)], d("2026-10-19")), [0, 2, 4]);
  // Ended patterns don't count.
  assert.equal(weekdaysFromPatterns([pat(0, "2026-01-01", "2026-06-30")], d("2026-10-19")), null);
});

test("resolveWorkingWeek: pattern wins, else stored count, else 5", () => {
  assert.deepEqual(resolveWorkingWeek([0, 2, 4], 5), { weekdays: [0, 2, 4], daysPerWeek: 3 });
  assert.deepEqual(resolveWorkingWeek(null, 3), { weekdays: null, daysPerWeek: 3 });
  assert.deepEqual(resolveWorkingWeek(null, 0), { weekdays: null, daysPerWeek: 5 });
});

test("countWorkingDays: Brian's 19–30 Oct sickness on a 3-day week is 6 days", () => {
  assert.equal(countWorkingDays(d("2026-10-19"), d("2026-10-30"), [0, 2, 4]), 6);
  // Unknown weekdays fall back to Mon–Fri.
  assert.equal(countWorkingDays(d("2026-10-19"), d("2026-10-30"), null), 10);
  // Weekend workers count weekends.
  assert.equal(countWorkingDays(d("2026-10-17"), d("2026-10-18"), [5, 6]), 2);
});

test("weeksToWorkingDays: a week is their working week", () => {
  assert.equal(weeksToWorkingDays(2, 5), 10);
  assert.equal(weeksToWorkingDays(2, 3), 6);
});

test("prorateForStartDate: Sam starting 1 Nov gets 5 of 28", () => {
  // 61 of 365 days × 28 = 4.68 → rounded up to 5.
  assert.equal(prorateForStartDate(28, d("2026-11-01"), d("2026-01-01"), d("2026-12-31")), 5);
  assert.equal(prorateForStartDate(28, d("2025-03-01"), d("2026-01-01"), d("2026-12-31")), 28);
  assert.equal(prorateForStartDate(28, null, d("2026-01-01"), d("2026-12-31")), 28);
  assert.equal(prorateForStartDate(28, d("2027-02-01"), d("2026-01-01"), d("2026-12-31")), 0);
});

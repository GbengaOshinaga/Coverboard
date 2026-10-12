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
  // November and December started: 28 × 2/12 = 4.67 → rounded up to 5.
  assert.equal(prorateForStartDate(28, d("2026-11-01"), d("2026-01-01"), d("2026-12-31")), 5);
  assert.equal(prorateForStartDate(28, d("2025-03-01"), d("2026-01-01"), d("2026-12-31")), 28);
  assert.equal(prorateForStartDate(28, null, d("2026-01-01"), d("2026-12-31")), 28);
  assert.equal(prorateForStartDate(28, d("2027-02-01"), d("2026-01-01"), d("2026-12-31")), 0);
});

test("prorateForStartDate counts the month they start in as a whole month, as GOV.UK does", () => {
  // 31 December: December started, 28 × 1/12 = 2.33 → 2.5 (half days round up).
  assert.equal(prorateForStartDate(28, d("2026-12-31"), d("2026-01-01"), d("2026-12-31")), 2.5);
  // A 3-day week (16.8 days) from 1 June: 7 months, 9.8 → 10.
  assert.equal(prorateForStartDate(16.8, d("2026-06-01"), d("2026-01-01"), d("2026-12-31")), 10);
});

test("prorateForStartDate runs months from the leave year's start date", () => {
  const yearStart = d("2026-04-06");
  const yearEnd = new Date(Date.UTC(2027, 3, 5, 23, 59, 59, 999));
  // 5 May is still the first month (6 April–5 May): the whole year.
  assert.equal(prorateForStartDate(28, d("2026-05-05"), yearStart, yearEnd), 28);
  // 6 May starts the second month: 11 months, 25.67 → 26.
  assert.equal(prorateForStartDate(28, d("2026-05-06"), yearStart, yearEnd), 26);
  // A year from 31 January has a month from 28 February.
  const jan31 = d("2026-01-31");
  const jan31End = new Date(Date.UTC(2027, 0, 30, 23, 59, 59, 999));
  assert.equal(prorateForStartDate(28, d("2026-02-28"), jan31, jan31End), 26);
  assert.equal(prorateForStartDate(28, d("2026-02-27"), jan31, jan31End), 28);
});

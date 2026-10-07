import test from "node:test";
import assert from "node:assert/strict";
import { holidayOnLeaving } from "./holiday-on-leaving";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const year = { employedFrom: d("2026-01-01"), yearEnd: new Date("2026-12-31T23:59:59.999Z") };

test("(A × B) − C: 28 days, leaving 30 June (181 of 365 days), 10 taken", () => {
  const r = holidayOnLeaving({ unit: "days", yearEntitlement: 28, carriedOver: 0, taken: 10, ...year, lastDay: d("2026-06-30") });
  assert.equal(r.proportion, 0.4959);
  assert.equal(r.accrued, 13.88); // 28 × 181/365
  assert.equal(r.owed, 3.88);
});

test("carried-over leave still owed is paid too", () => {
  const r = holidayOnLeaving({ unit: "days", yearEntitlement: 28, carriedOver: 5, taken: 10, ...year, lastDay: d("2026-06-30") });
  assert.equal(r.owed, 8.88);
});

test("taken more than built up: negative (recover only if agreed in writing)", () => {
  const r = holidayOnLeaving({ unit: "days", yearEntitlement: 28, carriedOver: 0, taken: 20, ...year, lastDay: d("2026-03-31") });
  assert.equal(r.accrued, 6.9); // 28 × 90/365
  assert.equal(r.owed, -13.1);
});

test("started part-way: their share of the year is already in the allowance", () => {
  // Started 1 Jul (allowance 14.1 → 15 rounded up); leaves 30 Sep: 92 of 184 days.
  const r = holidayOnLeaving({ unit: "days", yearEntitlement: 15, carriedOver: 0, taken: 2, employedFrom: d("2026-07-01"), yearEnd: year.yearEnd, lastDay: d("2026-09-30") });
  assert.equal(r.proportion, 0.5);
  assert.equal(r.owed, 5.5);
});

test("irregular hours: the 12.07% accrual is already what's built up", () => {
  const r = holidayOnLeaving({ unit: "hours", yearEntitlement: 120.7, carriedOver: 0, taken: 40, ...year, lastDay: d("2026-06-30") });
  assert.equal(r.proportion, 1);
  assert.equal(r.owed, 80.7);
});

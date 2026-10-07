import test from "node:test";
import assert from "node:assert/strict";
import { isLeavingLater, leavingDateError } from "./leavers";

const today = "2026-10-07";

test("leaving date: past, today or up to a year ahead, not before they started", () => {
  assert.equal(leavingDateError({ lastDay: "2026-09-30", today, serviceStartDate: null }), null);
  assert.equal(leavingDateError({ lastDay: "2026-11-30", today, serviceStartDate: null }), null);
  assert.match(leavingDateError({ lastDay: "2024-01-31", today, serviceStartDate: new Date("2024-02-01T00:00:00Z") })!, /before they started/);
  assert.match(leavingDateError({ lastDay: "2027-10-09", today, serviceStartDate: null })!, /more than a year/);
  assert.match(leavingDateError({ lastDay: "", today, serviceStartDate: null })!, /Pick their last day/);
});

test("a future last day keeps them on the team until then", () => {
  assert.equal(isLeavingLater("2026-11-30", today), true);
  assert.equal(isLeavingLater(today, today), false);
  assert.equal(isLeavingLater("2026-09-30", today), false);
});

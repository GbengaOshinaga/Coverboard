import test from "node:test";
import assert from "node:assert/strict";
import { shiftLengthHours } from "./cover-shifts";

test("shiftLengthHours: day, overnight, part hours, full day", () => {
  assert.equal(shiftLengthHours("08:00", "20:00"), 12);
  assert.equal(shiftLengthHours("20:00", "08:00"), 12);
  assert.equal(shiftLengthHours("21:30", "07:00"), 9.5);
  assert.equal(shiftLengthHours("09:15", "17:00"), 7.75);
  assert.equal(shiftLengthHours("07:00", "07:00"), 24);
});

import test from "node:test";
import assert from "node:assert/strict";
import { describeFte, fteLabel } from "./fte";

test("fixed-hours staff: the contracted FTE they were given", () => {
  const fte = describeFte({ employmentType: "PART_TIME", fteRatio: 0.6, weeklyHours: [40, 40] });
  assert.deepEqual(fte, { value: 0.6, basis: "contracted", weeks: 0 });
  assert.equal(fteLabel(fte), "FTE 0.6 (contracted)");
});

test("Eva, variable hours: logged hours average ÷ 37.5, not the default FTE of 1", () => {
  // 16h a week on average → 16 / 37.5 = 0.427
  const fte = describeFte({ employmentType: "VARIABLE_HOURS", fteRatio: 1, weeklyHours: [12, 20, 16] });
  assert.deepEqual(fte, { value: 0.427, basis: "logged_hours", weeks: 3 });
  assert.equal(fteLabel(fte), "FTE 0.427 (3 weeks' logged hours)");
});

test("uses the team's own full-time hours and only the last 52 weeks", () => {
  const fte = describeFte({
    employmentType: "ZERO_HOURS",
    fteRatio: 1,
    weeklyHours: [...Array(10).fill(80), ...Array(52).fill(20)],
    fullTimeHoursPerWeek: 40,
  });
  assert.deepEqual(fte, { value: 0.5, basis: "logged_hours", weeks: 52 });
});

test("no hours logged yet: says so instead of guessing 1", () => {
  const fte = describeFte({ employmentType: "ZERO_HOURS", fteRatio: 1, weeklyHours: [] });
  assert.deepEqual(fte, { value: null, basis: "logged_hours", weeks: 0 });
  assert.equal(fteLabel(fte), "FTE: no hours logged yet");
});

test("one week of logged hours reads \"1 week's\", not \"1 week'\"", () => {
  const fte = describeFte({ employmentType: "ZERO_HOURS", fteRatio: 1, weeklyHours: [40] });
  assert.equal(fteLabel(fte), "FTE 1 (1 week's logged hours)");
});

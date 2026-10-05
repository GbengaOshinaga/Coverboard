import test from "node:test";
import assert from "node:assert/strict";
import { optOutInForce, referenceWeeks, summariseWorkingTime, type WorkedShift } from "./working-time";

const at = (iso: string) => Date.parse(`${iso}Z`);
const shift = (startIso: string, hours: number, source: WorkedShift["source"] = "pattern"): WorkedShift => ({
  start: at(startIso),
  end: at(startIso) + hours * 3_600_000,
  source,
});

const weeks = ["2026-09-07", "2026-09-14"];
const base = { weeks, loggedHours: new Map<string, number>(), leaveDays: 0, daysPerWeek: 4, optedOut: false };

test("Chloe: four 12-hour days a week is 48 — at the limit, not over it", () => {
  const shifts = weeks.flatMap((w) =>
    [0, 1, 2, 3].map((d) => shift(`${new Date(Date.parse(`${w}T08:00:00Z`) + d * 86_400_000).toISOString().slice(0, 19)}`, 12))
  );
  const s = summariseWorkingTime({ ...base, shifts });
  assert.equal(s.averageHours, 48);
  assert.equal(s.weeksOver48, 0);
  assert.equal(s.overAverageLimit, false);
});

test("over 48 on average without an opt-out is flagged; with one it isn't", () => {
  const shifts = weeks.flatMap((w) =>
    [0, 1, 2, 3, 4].map((d) => shift(`${new Date(Date.parse(`${w}T08:00:00Z`) + d * 86_400_000).toISOString().slice(0, 19)}`, 12))
  );
  const s = summariseWorkingTime({ ...base, shifts });
  assert.equal(s.averageHours, 60);
  assert.equal(s.weeksOver48, 2);
  assert.equal(s.overAverageLimit, true);
  assert.equal(summariseWorkingTime({ ...base, shifts, optedOut: true }).overAverageLimit, false);
});

test("a week on leave doesn't pull the average down", () => {
  // 48 hours in week 1; week 2 all on leave (4 working days).
  const shifts = [0, 1, 2, 3].map((d) =>
    shift(`${new Date(Date.parse("2026-09-07T08:00:00Z") + d * 86_400_000).toISOString().slice(0, 19)}`, 12)
  );
  assert.equal(summariseWorkingTime({ ...base, shifts, leaveDays: 4 }).averageHours, 48);
  assert.equal(summariseWorkingTime({ ...base, shifts, leaveDays: 0 }).averageHours, 24);
});

test("logged hours replace the schedule for that week", () => {
  const s = summariseWorkingTime({ ...base, shifts: [shift("2026-09-07T08:00:00", 12)], loggedHours: new Map([["2026-09-07", 30]]) });
  assert.deepEqual(s.weeks[0], { weekStart: "2026-09-07", hours: 30, logged: true });
});

test("a night shift ending 08:00 then a day shift at 15:00 is only 7 hours' rest", () => {
  const s = summariseWorkingTime({
    ...base,
    shifts: [shift("2026-09-07T20:00:00", 12), shift("2026-09-08T15:00:00", 8, "cover")],
  });
  assert.deepEqual(s.restGaps, [{ date: "2026-09-08", gapHours: 7 }]);
});

test("opt-out in force between its dates", () => {
  const p = { optOutFrom: new Date("2026-01-01T00:00:00Z"), optOutUntil: new Date("2026-06-30T00:00:00Z") };
  assert.equal(optOutInForce(p, new Date("2026-06-30T12:00:00Z")), true);
  assert.equal(optOutInForce(p, new Date("2026-07-01T00:00:00Z")), false);
  assert.equal(optOutInForce({ optOutFrom: null, optOutUntil: null }), false);
  assert.equal(optOutInForce({ optOutFrom: new Date("2026-01-01T00:00:00Z"), optOutUntil: null }), true);
});

test("reference period: the 17 full weeks before this one", () => {
  const w = referenceWeeks(new Date("2026-10-07T10:00:00Z"));
  assert.equal(w.length, 17);
  assert.equal(w[16], "2026-09-28");
  assert.equal(w[0], "2026-06-08");
});

test("someone who started part-way is averaged over the weeks since they started", () => {
  // 17-week period, started in the last week: five 12-hour days = 60 that week.
  const weeks17 = Array.from({ length: 17 }, (_, i) =>
    new Date(Date.parse("2026-06-08T00:00:00Z") + i * 7 * 86_400_000).toISOString().slice(0, 10)
  );
  const lastWeek = weeks17[16];
  const shifts = [0, 1, 2, 3, 4].map((d) =>
    shift(`${new Date(Date.parse(`${lastWeek}T08:00:00Z`) + d * 86_400_000).toISOString().slice(0, 19)}`, 12)
  );
  const input = { ...base, weeks: weeks17, shifts, daysPerWeek: 5 };
  assert.equal(summariseWorkingTime(input).averageHours, 3.5); // diluted over 17
  const s = summariseWorkingTime({ ...input, startedOn: lastWeek });
  assert.equal(s.averageHours, 60);
  assert.equal(s.overAverageLimit, true);
  assert.equal(s.weeks.length, 1);
});

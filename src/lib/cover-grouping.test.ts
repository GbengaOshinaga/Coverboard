import test from "node:test";
import assert from "node:assert/strict";
import { groupCoverByPerson } from "./cover-grouping";

const cand = (id: string, name: string, weekHours = 24) => ({ id, name, employmentType: "FULL_TIME", weekHours });
const rest = (id: string, name: string) => ({ id, name, reason: "rest" as const, note: "Night shift until 08:00" });
const leave = (id: string, name: string) => ({ id, name, reason: "on_leave" as const, note: null });

test("each person appears once, with every shift they could cover", () => {
  const g = groupCoverByPerson([
    { date: "2026-10-05", shiftId: "day", shiftName: "Day", available: 2, required: 3, coverCandidates: [cand("n", "Nell")], ruledOut: [rest("a", "Nia")] },
    { date: "2026-10-06", shiftId: "day", shiftName: "Day", available: 1, required: 3, coverCandidates: [cand("n", "Nell", 36), cand("b", "Ben")], ruledOut: [rest("a", "Nia")] },
  ]);
  assert.deepEqual(g.people.map((p) => [p.name, p.options.map((o) => o.date)]), [
    ["Nell", ["2026-10-05", "2026-10-06"]],
    ["Ben", ["2026-10-06"]],
  ]);
  assert.equal(g.people[0].options[1].weekHours, 36);
});

test("ruled-out people are counted per reason", () => {
  const g = groupCoverByPerson([
    { date: "2026-10-05", shiftId: "day", shiftName: "Day", available: 2, required: 3, ruledOut: [rest("a", "Nia"), leave("d", "Dan")] },
    { date: "2026-10-06", shiftId: "day", shiftName: "Day", available: 2, required: 3, ruledOut: [rest("a", "Nia")] },
  ]);
  assert.deepEqual(g.ruledOut, [
    { id: "a", name: "Nia", restShifts: 2, leaveShifts: 0 },
    { id: "d", name: "Dan", restShifts: 0, leaveShifts: 1 },
  ]);
});

test("flags shifts no one can cover", () => {
  const g = groupCoverByPerson([
    { date: "2026-10-05", shiftId: "day", shiftName: "Day", available: 2, required: 3, coverCandidates: [] },
    { date: "2026-10-06", shiftId: "day", shiftName: "Day", available: 2, required: 3, coverCandidates: [cand("n", "Nell")] },
  ]);
  assert.deepEqual(g.shifts.map((s) => s.noOneFree), [true, false]);
});

test("attaches each person's latest offer for that shift", () => {
  const g = groupCoverByPerson([
    {
      date: "2026-10-05", shiftId: "day", shiftName: "Day", available: 2, required: 3,
      coverCandidates: [cand("n", "Nell")],
      offers: [
        { id: "o1", userId: "n", status: "DECLINED" },
        { id: "o2", userId: "n", status: "PENDING" },
        { id: "o3", userId: "x", status: "PENDING" },
      ],
    },
  ]);
  assert.deepEqual(g.people[0].options[0].offer, { id: "o2", userId: "n", status: "PENDING" });
});

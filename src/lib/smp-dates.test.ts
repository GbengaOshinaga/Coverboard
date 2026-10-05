import test from "node:test";
import assert from "node:assert/strict";
import { maternityLeaveLatestEnd, qualifyingWeek, smpEarningsCutoff } from "./smp-dates";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const day = (x: Date) => x.toISOString().slice(0, 10);

test("Chloe: due 15 Feb 2027 → qualifying week 1–7 Nov 2026", () => {
  const qw = qualifyingWeek(d("2027-02-15"));
  assert.equal(day(qw.start), "2026-11-01");
  assert.equal(day(qw.end), "2026-11-07");
});

test("earnings for SMP: the 8 weeks up to the qualifying week, not before the leave starts", () => {
  assert.equal(day(smpEarningsCutoff({ expectedDueDate: d("2027-02-15"), startDate: d("2027-02-01") })), "2026-11-08");
  assert.equal(day(smpEarningsCutoff({ expectedDueDate: null, startDate: d("2027-02-01") })), "2027-02-01");
});

test("a due date on a Sunday is the first day of its week", () => {
  assert.equal(day(qualifyingWeek(d("2027-02-14")).start), "2026-11-01");
});

test("maternity leave can last 52 weeks: 1 Feb 2027 → 30 Jan 2028", () => {
  assert.equal(day(maternityLeaveLatestEnd(d("2027-02-01"))), "2028-01-30");
});

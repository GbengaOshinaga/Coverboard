import test from "node:test";
import assert from "node:assert/strict";
import {
  lastDayBefore,
  maternityLeaveLatestEnd,
  qualifyingWeek,
  smpEarningsCutoff,
  smpPayInPeriod,
  weeklyStatutoryPayFor,
} from "./smp-dates";

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

test("Chloe's February: 28 days in the first 6 weeks at £450 a week = £1,800", () => {
  const p = smpPayInPeriod({
    leaveStart: d("2027-02-01"),
    leaveEnd: d("2027-02-28"),
    phase1End: d("2027-03-15"),
    phase2End: d("2027-11-01"),
    phase1Weekly: 450,
    phase2Weekly: 194.32,
    from: d("2027-02-01"),
    to: d("2027-02-28"),
  });
  assert.deepEqual(p, { phase1Days: 28, phase2Days: 0, pay: 1800 });
});

test("a pay period across the change from 90% to the flat rate is split by day", () => {
  // March 2027 on a long leave: 1–14 Mar at £450, 15–31 Mar at £194.32.
  const p = smpPayInPeriod({
    leaveStart: d("2027-02-01"),
    leaveEnd: d("2027-12-31"),
    phase1End: d("2027-03-15"),
    phase2End: d("2027-11-01"),
    phase1Weekly: 450,
    phase2Weekly: 194.32,
    from: d("2027-03-01"),
    to: d("2027-03-31"),
  });
  assert.equal(p.phase1Days, 14);
  assert.equal(p.phase2Days, 17);
  assert.equal(p.pay, 900 + weeklyStatutoryPayFor(194.32, 17));
});

test("phases end the day before their stored boundary: 14 Mar and 31 Oct", () => {
  assert.equal(day(lastDayBefore(d("2027-03-15"))), "2027-03-14");
  assert.equal(day(lastDayBefore(d("2027-11-01"))), "2027-10-31");
});

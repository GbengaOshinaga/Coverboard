import test from "node:test";
import assert from "node:assert/strict";
import { calculateSmpEntitlement } from "./smpCalculator";
import {
  birthPayKind,
  lastDayBefore,
  latestStartForService,
  matchingWeek,
  parentPayDates,
  shppClaimError,
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

test("26 weeks' service into the qualifying week: HMRC's due date of 10 Oct 2014", () => {
  // Qualifying week 22–28 Jun 2014 (HMRC's example); weeks run Sunday–Saturday
  // and any part of a week counts, so the latest start is Sat 4 Jan 2014.
  const qw = qualifyingWeek(d("2014-10-10"));
  assert.equal(day(qw.start), "2014-06-22");
  assert.equal(day(latestStartForService(qw)), "2014-01-04");
  const awe = 300;
  assert.equal(calculateSmpEntitlement(awe, { serviceStartDate: d("2014-01-04"), expectedDueDate: d("2014-10-10") }).eligible, true);
  assert.equal(calculateSmpEntitlement(awe, { serviceStartDate: d("2014-01-05"), expectedDueDate: d("2014-10-10") }).eligible, false);
});

test("adoption: the matching week sets the service test and the 8 earnings weeks", () => {
  // Told of the match on Wed 3 Mar 2027: matching week Sun 28 Feb – Sat 6 Mar.
  const mw = matchingWeek(d("2027-03-03"));
  assert.equal(day(mw.start), "2027-02-28");
  assert.equal(day(mw.end), "2027-03-06");
  assert.equal(birthPayKind("Adoption Leave"), "SAP");
  assert.equal(birthPayKind("Statutory Maternity Leave"), "SMP");
  assert.equal(birthPayKind("Statutory Paternity Leave"), null);
  // Earnings are the 8 weeks before Sun 7 Mar, whenever placement starts.
  assert.equal(
    day(smpEarningsCutoff({ kind: "SAP", expectedDueDate: null, matchedDate: d("2027-03-03"), startDate: d("2027-05-10") })),
    "2027-03-07"
  );
  // No matching date: falls back to the leave start.
  assert.equal(day(smpEarningsCutoff({ kind: "SAP", expectedDueDate: null, matchedDate: null, startDate: d("2027-05-10") })), "2027-05-10");
  // Service: the latest start is Sat 12 Sep 2026.
  assert.equal(day(latestStartForService(mw)), "2026-09-12");
  assert.equal(calculateSmpEntitlement(400, { serviceStartDate: d("2026-09-13"), serviceTestWeek: mw }).eligible, false);
  assert.equal(calculateSmpEntitlement(400, { serviceStartDate: d("2026-09-12"), serviceTestWeek: mw }).eligible, true);
});

test("ShPP: at most 37 weeks (259 days) of pay for a child, across bookings", () => {
  const block = (from: string, to: string) => ({ startDate: d(from), endDate: d(to) });
  // 30 weeks already claimed (210 days), 7 more is exactly 37.
  const thirty = [block("2027-01-04", "2027-08-01")];
  assert.equal(shppClaimError({ otherClaims: thirty, request: block("2027-08-02", "2027-09-19") }), null);
  // One more day is over.
  assert.match(
    shppClaimError({ otherClaims: thirty, request: block("2027-08-02", "2027-09-20") })!,
    /more than 37 weeks .* 49 days of pay left/
  );
});

test("paternity and shared parental pay: matching date, else due date, else birth date (noted)", () => {
  const due = d("2027-06-14");
  const matched = d("2027-03-03");
  const born = d("2027-06-20");
  assert.deepEqual(parentPayDates({ expectedDueDate: due, matchedDate: matched }), { expectedDueDate: null, matchedDate: matched, note: null });
  assert.deepEqual(parentPayDates({ expectedDueDate: due, matchedDate: null, childBirthDate: born }), { expectedDueDate: due, matchedDate: null, note: null });
  const fromBirth = parentPayDates({ expectedDueDate: null, matchedDate: null, childBirthDate: born });
  assert.equal(fromBirth.expectedDueDate, born);
  assert.match(fromBirth.note!, /birth date/);
  assert.match(parentPayDates({ expectedDueDate: null, matchedDate: null }).note!, /before the leave starts/);
});

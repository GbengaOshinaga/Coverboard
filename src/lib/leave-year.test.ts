import test from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_LEAVE_YEAR,
  companyCarryOverExpiry,
  expiryDateError,
  firstDateAfterYear,
  lastExpiryDay,
  leaveYearBounds,
  leaveYearLabel,
  leaveYearOf,
  rolloverLeaveYear,
} from "./leave-year";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const day = (x: Date) => x.toISOString().slice(0, 10);
const april = { month: 4, day: 1 };

test("calendar leave years are unchanged", () => {
  assert.equal(leaveYearOf(d("2026-10-06"), CALENDAR_LEAVE_YEAR), 2026);
  const b = leaveYearBounds(2026, CALENDAR_LEAVE_YEAR);
  assert.equal(day(b.start), "2026-01-01");
  assert.equal(b.end.toISOString(), "2026-12-31T23:59:59.999Z");
  assert.equal(leaveYearLabel(2026, CALENDAR_LEAVE_YEAR), "2026");
});

test("a 1 April leave year: 2026/27 runs 1 Apr 2026 – 31 Mar 2027", () => {
  assert.equal(leaveYearOf(d("2026-03-31"), april), 2025);
  assert.equal(leaveYearOf(d("2026-04-01"), april), 2026);
  assert.equal(leaveYearOf(d("2027-03-31"), april), 2026);
  const b = leaveYearBounds(2026, april);
  assert.equal(day(b.start), "2026-04-01");
  assert.equal(day(b.end), "2027-03-31");
  assert.equal(leaveYearLabel(2026, april), "2026/27");
  assert.equal(leaveYearLabel(2099, april), "2099/00");
});

test("company carry-over expiry: the first such date after the leave year ends", () => {
  // Calendar year 2026, expiry 31 March → 31 Mar 2027.
  assert.equal(day(firstDateAfterYear(2026, CALENDAR_LEAVE_YEAR, 3, 31)), "2027-03-31");
  // April year 2026/27 ends 31 Mar 2027; "30 June" → 30 Jun 2027; "31 March" → 31 Mar 2028.
  assert.equal(day(firstDateAfterYear(2026, april, 6, 30)), "2027-06-30");
  assert.equal(day(firstDateAfterYear(2026, april, 3, 31)), "2028-03-31");
});

test("rollover year: the one just ended until halfway through the next", () => {
  assert.equal(rolloverLeaveYear(d("2026-02-10"), CALENDAR_LEAVE_YEAR), 2025);
  assert.equal(rolloverLeaveYear(d("2026-10-06"), CALENDAR_LEAVE_YEAR), 2026);
  assert.equal(rolloverLeaveYear(d("2026-05-10"), april), 2025); // just after 31 Mar 2026
  assert.equal(rolloverLeaveYear(d("2026-12-01"), april), 2026); // 2026/27 ends next March
});

test("a starter on 1 Oct 2026 in an April leave year gets half the year (182 of 365 days)", async () => {
  const { prorateForStartDate } = await import("./working-week");
  const { start, end } = leaveYearBounds(2026, april);
  // 28 days × 182/365 = 13.96 → 14 (rounded up).
  assert.equal(prorateForStartDate(28, d("2026-10-01"), start, end), 14);
  // 1 July in a calendar year: 184 of 365 days → 28 × 184/365 = 14.1 → 15.
  const cal = leaveYearBounds(2026, CALENDAR_LEAVE_YEAR);
  assert.equal(prorateForStartDate(28, d("2026-07-01"), cal.start, cal.end), 15);
});

test("company carry-over expiry: flags a date that lasts the whole next year, or comes within a month", () => {
  // Calendar year, 31 March: carried out of 2026, gone 31 Mar 2027. Fine.
  const cal = companyCarryOverExpiry(2026, CALENDAR_LEAVE_YEAR, 3, 31);
  assert.equal(day(cal.expiresOn), "2027-03-31");
  assert.equal(cal.wholeNextYear, false);
  assert.equal(cal.withinFirstMonth, false);
  // April year, 31 March: carried out of 2026/27, lasts all of 2027/28.
  const apr = companyCarryOverExpiry(2026, april, 3, 31);
  assert.equal(day(apr.expiresOn), "2028-03-31");
  assert.equal(apr.wholeNextYear, true);
  // April year, 30 June: three months in. Fine.
  assert.deepEqual(
    { ...companyCarryOverExpiry(2026, april, 6, 30), expiresOn: undefined },
    { expiresOn: undefined, wholeNextYear: false, withinFirstMonth: false }
  );
  // April year, 15 April: two weeks to use it.
  assert.equal(companyCarryOverExpiry(2026, april, 4, 15).withinFirstMonth, true);
});

test("carry-over expiry: impossible dates are refused, not rolled into March", () => {
  assert.match(expiryDateError(2, 31)!, /February expiry has to be a day from 1 to 28/);
  assert.match(expiryDateError(2, 29)!, /1 to 28/);
  assert.match(expiryDateError(4, 31)!, /April expiry has to be a day from 1 to 30/);
  assert.match(expiryDateError(3, 0)!, /1 to 31/);
  assert.equal(expiryDateError(3, 31), null);
  assert.equal(expiryDateError(2, 28), null);
  assert.equal(lastExpiryDay(9), 30);
});

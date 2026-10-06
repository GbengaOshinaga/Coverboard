import test from "node:test";
import assert from "node:assert/strict";
import { eighteenthBirthday, uplEntitledFrom, uplError, uplUsage, uplYearContaining } from "./unpaid-parental";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fiveDay = { daysPerWeek: 5, weekdays: null };
const ada = { childName: "Ada", dateOfBirth: d("2020-03-01"), serviceStartDate: null, weeksTakenElsewhere: 0, ...fiveDay };

test("4 weeks a year per child: a parent of two can take 8 weeks a year", () => {
  // 4 weeks (20 days) for Ada already this year.
  const adaBookings = [{ startDate: d("2026-03-02"), endDate: d("2026-03-27") }];
  const fifthWeekForAda = { startDate: d("2026-06-01"), endDate: d("2026-06-05") };
  assert.match(uplError({ ...ada, bookings: adaBookings, request: fifthWeekForAda })!, /more than 4 weeks .* for Ada in the year 1 Mar 2026 – 28 Feb 2027\. 0 days left/);
  // Same week for her brother is fine: the limit is per child.
  const ben = { ...ada, childName: "Ben", dateOfBirth: d("2022-07-15") };
  assert.equal(uplError({ ...ben, bookings: [], request: fifthWeekForAda }), null);
});

test("18 weeks per child in total, including weeks taken with a previous employer", () => {
  const request = { startDate: d("2026-03-02"), endDate: d("2026-03-06") }; // 1 week
  assert.equal(uplError({ ...ada, weeksTakenElsewhere: 17, bookings: [], request }), null);
  assert.match(uplError({ ...ada, weeksTakenElsewhere: 18, bookings: [], request })!, /more than the 18 weeks \(90 working days\).*0 days left/);
});

test("a week is their working week: 4 weeks = 12 days for a 3-day worker", () => {
  const threeDay = { ...ada, daysPerWeek: 3, weekdays: [0, 2, 4] };
  // Mon 2 – Fri 27 Mar 2026 is 12 working days on Mon/Wed/Fri: exactly 4 weeks.
  assert.equal(uplError({ ...threeDay, bookings: [], request: { startDate: d("2026-03-02"), endDate: d("2026-03-27") } }), null);
  assert.match(uplError({ ...threeDay, bookings: [], request: { startDate: d("2026-03-02"), endDate: d("2026-03-30") } })!, /12 working days/);
});

test("must end before the child's 18th birthday", () => {
  assert.equal(eighteenthBirthday(d("2008-11-10")).toISOString().slice(0, 10), "2026-11-10");
  const teen = { ...ada, dateOfBirth: d("2008-11-10") };
  assert.match(uplError({ ...teen, bookings: [], request: { startDate: d("2026-11-09"), endDate: d("2026-11-10") } })!, /before their 18th birthday \(2026-11-10\)/);
  assert.equal(uplError({ ...teen, bookings: [], request: { startDate: d("2026-11-02"), endDate: d("2026-11-09") } }), null);
});

test("the year is the child's: from the birthday (or a year's service), not 1 January", () => {
  // Ada born 1 Mar 2020: years run 1 Mar – 28 Feb.
  const y = uplYearContaining(d("2027-01-15"), uplEntitledFrom(d("2020-03-01"), null));
  assert.equal(y.start.toISOString().slice(0, 10), "2026-03-01");
  assert.equal(y.end.toISOString().slice(0, 10), "2027-02-28");
  // Started work 10 Jan 2024 with an older child: entitled from 10 Jan 2025.
  assert.equal(uplEntitledFrom(d("2015-06-01"), d("2024-01-10")).toISOString().slice(0, 10), "2025-01-10");
  // Born after a year's service: entitled from the birth.
  assert.equal(uplEntitledFrom(d("2026-05-01"), d("2020-01-10")).toISOString().slice(0, 10), "2026-05-01");
});

test("December and January are the same year when the child was born in March", () => {
  // 20 days in Dec 2026 then 5 in Jan 2027 – all in Ada's 1 Mar 2026 – 28 Feb 2027 year.
  const dec = [{ startDate: d("2026-11-30"), endDate: d("2026-12-25") }];
  assert.match(uplError({ ...ada, bookings: dec, request: { startDate: d("2027-01-04"), endDate: d("2027-01-08") } })!, /0 days left/);
  // The same January week the year after her birthday rolls over is fine.
  assert.equal(uplError({ ...ada, bookings: dec, request: { startDate: d("2027-03-01"), endDate: d("2027-03-05") } }), null);
});

test("a booking across the child's birthday counts each part against its own year", () => {
  const booking = [{ startDate: d("2027-02-22"), endDate: d("2027-03-05") }];
  const entitled = uplEntitledFrom(d("2020-03-01"), null);
  const before = uplUsage({ bookings: booking, year: uplYearContaining(d("2027-02-22"), entitled), weeksTakenElsewhere: 0, ...fiveDay });
  const after = uplUsage({ bookings: booking, year: uplYearContaining(d("2027-03-01"), entitled), weeksTakenElsewhere: 0, ...fiveDay });
  assert.equal(before.daysThisYear, 5); // Mon 22 – Fri 26 Feb
  assert.equal(after.daysThisYear, 5); // Mon 1 – Fri 5 Mar
  assert.equal(before.daysTotal, 10);
});

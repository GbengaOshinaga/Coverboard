import test from "node:test";
import assert from "node:assert/strict";
import { eighteenthBirthday, uplError, uplUsage } from "./unpaid-parental";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fiveDay = { daysPerWeek: 5, weekdays: null };
const ada = { childName: "Ada", dateOfBirth: d("2020-03-01"), weeksTakenElsewhere: 0, ...fiveDay };

test("4 weeks a year per child: a parent of two can take 8 weeks a year", () => {
  // 4 weeks (20 days) for Ada already this year.
  const adaBookings = [{ startDate: d("2026-03-02"), endDate: d("2026-03-27") }];
  const fifthWeekForAda = { startDate: d("2026-06-01"), endDate: d("2026-06-05") };
  assert.match(uplError({ ...ada, bookings: adaBookings, request: fifthWeekForAda })!, /more than 4 weeks .* for Ada in 2026\. 0 days left/);
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

test("a booking over New Year counts each part against its own year", () => {
  const usage2026 = uplUsage({ bookings: [{ startDate: d("2026-12-28"), endDate: d("2027-01-08") }], year: 2026, weeksTakenElsewhere: 0, ...fiveDay });
  const usage2027 = uplUsage({ bookings: [{ startDate: d("2026-12-28"), endDate: d("2027-01-08") }], year: 2027, weeksTakenElsewhere: 0, ...fiveDay });
  assert.equal(usage2026.daysThisYear, 4); // Mon 28 – Thu 31 Dec
  assert.equal(usage2027.daysThisYear, 6); // Fri 1 – Fri 8 Jan
  assert.equal(usage2026.daysTotal, 10);
});

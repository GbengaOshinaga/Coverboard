import test from "node:test";
import assert from "node:assert/strict";
import { eighteenthBirthday, uplEntitledFrom, uplError, uplUsage, uplWholeWeeksError, uplYearContaining } from "./unpaid-parental";

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
  assert.match(uplError({ ...threeDay, bookings: [], request: { startDate: d("2026-03-02"), endDate: d("2026-04-03") } })!, /12 working days/);
});

test("must end before the child's 18th birthday", () => {
  assert.equal(eighteenthBirthday(d("2008-11-10")).toISOString().slice(0, 10), "2026-11-10");
  const teen = { ...ada, dateOfBirth: d("2008-11-10") };
  assert.match(uplError({ ...teen, bookings: [], request: { startDate: d("2026-11-09"), endDate: d("2026-11-10") } })!, /before their 18th birthday \(2026-11-10\)/);
  assert.equal(uplError({ ...teen, bookings: [], request: { startDate: d("2026-11-02"), endDate: d("2026-11-06") } }), null);
});

const iso = (x: Date) => x.toISOString().slice(0, 10);

test("the year is the child's: from when the parent became entitled, not 1 January", () => {
  // Ada born 1 Mar 2020: years run 1 Mar – 28 Feb.
  const y = uplYearContaining(d("2027-01-15"), uplEntitledFrom({ dateOfBirth: d("2020-03-01") }, null));
  assert.equal(iso(y.start), "2026-03-01");
  assert.equal(iso(y.end), "2027-02-28");
  // Born after they joined: entitled from the birth.
  assert.equal(iso(uplEntitledFrom({ dateOfBirth: d("2026-05-01") }, d("2020-01-10"))), "2026-05-01");
});

test("a year's service was needed before 6 April 2026; a day-one right after", () => {
  // Joined 10 Jan 2024 with an older child: a year's service on 10 Jan 2025, under the old rule. That stands.
  assert.equal(iso(uplEntitledFrom({ dateOfBirth: d("2015-06-01") }, d("2024-01-10"))), "2025-01-10");
  // Joined 1 Jun 2026 with a child born 2020 (the tester's case): entitled from day one, not the birthday.
  assert.equal(iso(uplEntitledFrom({ dateOfBirth: d("2020-06-01") }, d("2026-06-01"))), "2026-06-01");
  // Joined Aug 2025: a year's service would have come Aug 2026, but it became a day-one right on 6 Apr 2026.
  assert.equal(iso(uplEntitledFrom({ dateOfBirth: d("2020-06-01") }, d("2025-08-01"))), "2026-04-06");
  // Joined Aug 2025, child born Feb 2026: not entitled at the birth either – 6 Apr 2026.
  assert.equal(iso(uplEntitledFrom({ dateOfBirth: d("2026-02-10") }, d("2025-08-01"))), "2026-04-06");
});

test("an adopted child counts from placement, not birth", () => {
  const adopted = { dateOfBirth: d("2021-03-01"), placedOn: d("2024-09-15") };
  assert.equal(iso(uplEntitledFrom(adopted, null)), "2024-09-15");
  assert.equal(iso(uplEntitledFrom(adopted, d("2018-01-01"))), "2024-09-15");
  assert.match(
    uplError({ ...ada, ...adopted, bookings: [], request: { startDate: d("2024-09-02"), endDate: d("2024-09-06") } })!,
    /can't start before they were placed/
  );
  // Still ends at the 18th birthday, which goes by date of birth.
  assert.equal(iso(eighteenthBirthday(adopted.dateOfBirth)), "2039-03-01");
});

test("whole weeks only, unless the child gets a disability benefit", () => {
  // The tester's case: a 2-day booking for a full-timer.
  const twoDays = { startDate: d("2026-06-01"), endDate: d("2026-06-02") };
  assert.match(uplError({ ...ada, bookings: [], request: twoDays })!, /whole weeks\. A week here is 5 working days, and this booking is 2/);
  assert.equal(uplError({ ...ada, disabilityBenefit: true, bookings: [], request: twoDays }), null);
  // Two whole weeks are fine.
  assert.equal(uplError({ ...ada, bookings: [], request: { startDate: d("2026-06-01"), endDate: d("2026-06-12") } }), null);
  // A Wed–Tue week counts too: it's 5 working days.
  assert.equal(uplWholeWeeksError({ request: { startDate: d("2026-06-03"), endDate: d("2026-06-09") }, ...fiveDay }), null);
});

test("a week is their working week: Mon/Wed/Fri means 3 days is a week", () => {
  const mwf = { daysPerWeek: 3, weekdays: [0, 2, 4] };
  assert.equal(uplWholeWeeksError({ request: { startDate: d("2026-06-01"), endDate: d("2026-06-05") }, ...mwf }), null);
  assert.match(uplWholeWeeksError({ request: { startDate: d("2026-06-01"), endDate: d("2026-06-03") }, ...mwf })!, /3 working days, and this booking is 2/);
  // A part-timer with only a day count: we can't tell which days, so it isn't checked.
  assert.equal(uplWholeWeeksError({ request: { startDate: d("2026-06-01"), endDate: d("2026-06-02") }, daysPerWeek: 3, weekdays: null }), null);
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
  const entitled = uplEntitledFrom({ dateOfBirth: d("2020-03-01") }, null);
  const before = uplUsage({ bookings: booking, year: uplYearContaining(d("2027-02-22"), entitled), weeksTakenElsewhere: 0, ...fiveDay });
  const after = uplUsage({ bookings: booking, year: uplYearContaining(d("2027-03-01"), entitled), weeksTakenElsewhere: 0, ...fiveDay });
  assert.equal(before.daysThisYear, 5); // Mon 22 – Fri 26 Feb
  assert.equal(after.daysThisYear, 5); // Mon 1 – Fri 5 Mar
  assert.equal(before.daysTotal, 10);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  NEONATAL_MAX_WEEKS,
  isNeonatalCareLeaveType,
  calculateNeonatalWeeklyRate,
  calculateNeonatalCarePay,
  neonatalBookingError,
  neonatalWeeksEntitled,
  weekBeforeNeonatalCare,
} from "@/lib/neonatalPay";

const FLAT = 194.32; // 2026/27 statutory weekly rate

// ─── leave-type detection ─────────────────────────────────────────────

test("isNeonatalCareLeaveType matches the neonatal leave type", () => {
  assert.equal(isNeonatalCareLeaveType("Neonatal Care Leave"), true);
  assert.equal(isNeonatalCareLeaveType("Annual Leave"), false);
  assert.equal(isNeonatalCareLeaveType(null), false);
});

// ─── weekly rate = lower of flat or 90% AWE ───────────────────────────

test("weekly rate is 90% of AWE for low earners", () => {
  // 0.9 × 150 = 135 < 194.32 → £135
  assert.equal(calculateNeonatalWeeklyRate(150, FLAT), 135);
});

test("weekly rate is capped at the flat rate for high earners", () => {
  // 0.9 × 300 = 270 > 194.32 → flat
  assert.equal(calculateNeonatalWeeklyRate(300, FLAT), FLAT);
});

test("weekly rate is 0 with no earnings", () => {
  assert.equal(calculateNeonatalWeeklyRate(null, FLAT), 0);
  assert.equal(calculateNeonatalWeeklyRate(0, FLAT), 0);
});

// ─── full pay calc + eligibility + 12-week cap ────────────────────────

test("eligible earner: total = weekly rate × weeks", () => {
  const r = calculateNeonatalCarePay({
    averageWeeklyEarnings: 300,
    weeks: 4,
    flatRate: FLAT,
    lelWeekly: 129,
  });
  assert.equal(r.eligible, true);
  if (r.eligible) {
    assert.equal(r.weeklyRate, FLAT);
    assert.equal(r.weeksPayable, 4);
    assert.equal(r.total, Number((FLAT * 4).toFixed(2)));
  }
});

test("weeks are capped at the 12-week statutory maximum", () => {
  const r = calculateNeonatalCarePay({
    averageWeeklyEarnings: 300,
    weeks: 20,
    flatRate: FLAT,
    lelWeekly: 129,
  });
  assert.equal(r.eligible, true);
  if (r.eligible) {
    assert.equal(r.weeksPayable, NEONATAL_MAX_WEEKS);
  }
});

test("below the Lower Earnings Limit is not eligible", () => {
  const r = calculateNeonatalCarePay({
    averageWeeklyEarnings: 100, // below £129 LEL
    weeks: 4,
    flatRate: FLAT,
    lelWeekly: 129,
  });
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.equal(r.reason, "Below Lower Earnings Limit");
});

test("missing AWE is not eligible", () => {
  const r = calculateNeonatalCarePay({
    averageWeeklyEarnings: null,
    weeks: 4,
    flatRate: FLAT,
    lelWeekly: 129,
  });
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.equal(r.reason, "Missing average weekly earnings");
});

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const day = (x: Date) => x.toISOString().slice(0, 10);

test("weeks of neonatal care leave: 1 per 7 full days in care, up to 12", () => {
  assert.equal(neonatalWeeksEntitled({ firstFullDay: d("2027-03-01"), lastFullDay: d("2027-03-06") }).weeks, 0); // 6 days
  assert.equal(neonatalWeeksEntitled({ firstFullDay: d("2027-03-01"), lastFullDay: d("2027-03-07") }).weeks, 1); // 7 days
  assert.equal(neonatalWeeksEntitled({ firstFullDay: d("2027-03-01"), lastFullDay: d("2027-04-09") }).weeks, 5); // 40 days
  assert.equal(neonatalWeeksEntitled({ firstFullDay: d("2027-01-01"), lastFullDay: d("2027-12-31") }).weeks, 12);
  // Still in care: counted to today.
  const ongoing = neonatalWeeksEntitled({ firstFullDay: d("2027-03-01"), lastFullDay: null, today: d("2027-03-15") });
  assert.deepEqual(ongoing, { weeks: 2, daysInCare: 15, ongoing: true });
});

test("neonatal bookings: within the weeks in care and 68 weeks of the birth", () => {
  const block = (a: string, b: string) => ({ startDate: d(a), endDate: d(b) });
  const base = { otherBookings: [], entitledWeeks: 5, ongoing: false, birthDate: d("2027-02-27") };
  assert.equal(neonatalBookingError({ ...base, request: block("2027-06-07", "2027-07-11") }), null); // 35 days
  assert.match(neonatalBookingError({ ...base, request: block("2027-06-07", "2027-07-12") })!, /5 weeks .*\(35 days\)\. 35 days left/);
  assert.match(
    neonatalBookingError({ ...base, otherBookings: [block("2027-04-05", "2027-04-18")], request: block("2027-06-07", "2027-07-11") })!,
    /21 days left/
  );
  // 68 weeks from 27 Feb 2027 ends Fri 16 Jun 2028.
  assert.equal(neonatalBookingError({ ...base, request: block("2028-06-12", "2028-06-16") }), null);
  assert.match(neonatalBookingError({ ...base, request: block("2028-06-12", "2028-06-17") })!, /68 weeks of the birth \(by 2028-06-16\)/);
  assert.match(neonatalBookingError({ ...base, entitledWeeks: 0, ongoing: true, request: block("2027-03-01", "2027-03-05") })!, /once the baby has been in care for a week/);
});

test("the week before the baby went into neonatal care sets pay when there's no SMP, SPP or SAP", () => {
  // Into care Wed 3 Mar 2027 (week Sun 28 Feb – Sat 6 Mar): the week before is 21–27 Feb.
  const w = weekBeforeNeonatalCare(d("2027-03-03"));
  assert.equal(day(w.start), "2027-02-21");
  assert.equal(day(w.end), "2027-02-27");
});

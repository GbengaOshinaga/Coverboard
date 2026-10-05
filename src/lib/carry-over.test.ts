import test from "node:test";
import assert from "node:assert/strict";
import {
  carryOverInEffect,
  familyLeaveCarryExpiry,
  planYearEndCarryOver,
  sicknessCarryExpiry,
  type YearEndInput,
} from "./carry-over";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Leave taken on given dates, so takenBy(date) counts those on or before it. */
const takenOn = (days: Array<[string, number]>) => (date: Date | null) =>
  days.filter(([iso]) => date === null || d(iso) <= date).reduce((s, [, n]) => s + n, 0);

test("carry-over used before it expires stays used; only the unused part lapses", () => {
  // 5 days carried in, expiring 31 March; 3 days taken in February.
  const rows = [{ reason: "COMPANY_POLICY" as const, carried: 5, expiresAt: d("2027-03-31") }];
  const taken = takenOn([["2027-02-10", 3]]);
  const feb = carryOverInEffect(rows, taken, d("2027-02-20"));
  assert.equal(feb.allowance, 5);
  assert.equal(feb.parts[0].remaining, 2);
  // In June it has expired: the 3 used stay in the allowance, 2 lapse.
  // (Before, all 5 left the allowance and the 3 days taken counted twice.)
  const june = carryOverInEffect(rows, taken, d("2027-06-01"));
  assert.equal(june.allowance, 3);
  assert.deepEqual([june.parts[0].used, june.parts[0].lapsed, june.parts[0].remaining], [3, 2, 0]);
});

test("soonest-expiring carry-over is used first", () => {
  const rows = [
    { reason: "SICKNESS" as const, carried: 10, expiresAt: d("2028-06-30") },
    { reason: "COMPANY_POLICY" as const, carried: 5, expiresAt: d("2027-03-31") },
  ];
  const { parts } = carryOverInEffect(rows, takenOn([["2027-02-01", 7]]), d("2027-04-01"));
  assert.deepEqual(parts.map((p) => [p.reason, p.used, p.remaining]), [
    ["COMPANY_POLICY", 5, 0],
    ["SICKNESS", 2, 8],
  ]);
});

const base: YearEndInput = {
  fromYear: 2026,
  unit: "days",
  entitlement: 28,
  carriedIn: [],
  takenBy: takenOn([["2026-03-01", 10]]),
  daysPerWeek: 5,
  avgHoursPerDay: 7.5,
  sicknessDays: 0,
  familyLeaveDays: 0,
  includeStatutory: true,
  company: { enabled: true, max: 5, expiresAt: d("2027-03-31") },
};

test("no sickness or family leave: only the company carry-over", () => {
  assert.deepEqual(planYearEndCarryOver(base).rows.map((r) => [r.reason, r.carried]), [["COMPANY_POLICY", 5]]);
});

test("off sick: the untaken part of the 4 weeks carries for 18 months, then the company cap", () => {
  // 5-day week, took 10 of 28: 18 unused. 4 weeks = 20 days, 10 taken → 10 owed.
  const { rows } = planYearEndCarryOver({ ...base, sicknessDays: 30 });
  assert.deepEqual(
    rows.map((r) => [r.reason, r.carried, r.expiresAt?.toISOString().slice(0, 10)]),
    [
      ["SICKNESS", 10, "2028-06-30"],
      ["COMPANY_POLICY", 5, "2027-03-31"],
    ]
  );
});

test("family leave, 3-day week, nothing taken: 4 weeks = 12 days into next year", () => {
  const { rows } = planYearEndCarryOver({
    ...base,
    entitlement: 17,
    daysPerWeek: 3,
    takenBy: () => 0,
    familyLeaveDays: 60,
    company: { ...base.company, enabled: false },
  });
  assert.deepEqual(rows.map((r) => [r.reason, r.carried, r.expiresAt?.toISOString().slice(0, 10)]), [
    ["FAMILY_LEAVE", 12, "2027-12-31"],
  ]);
});

test("irregular-hours staff carry all their untaken hours after sickness", () => {
  const { rows } = planYearEndCarryOver({
    ...base,
    unit: "hours",
    entitlement: 120,
    takenBy: takenOn([["2026-02-01", 40]]),
    sicknessDays: 20,
  });
  assert.deepEqual(rows.map((r) => [r.reason, r.carried]), [["SICKNESS", 80]]);
});

test("the admin can decide someone could have taken their leave anyway", () => {
  const { rows } = planYearEndCarryOver({ ...base, sicknessDays: 30, includeStatutory: false });
  assert.deepEqual(rows.map((r) => r.reason), ["COMPANY_POLICY"]);
});

test("sickness carry-over still in date at the next year end comes forward, less what was used", () => {
  // 10 days carried into 2026 after sickness in 2025, valid until 30 June 2027.
  // 4 used by May; at the 2026 year end the other 6 come forward.
  const { rows } = planYearEndCarryOver({
    ...base,
    carriedIn: [{ reason: "SICKNESS", carried: 10, expiresAt: sicknessCarryExpiry(2025) }],
    takenBy: takenOn([["2026-05-01", 4]]),
    company: { ...base.company, enabled: false },
  });
  assert.deepEqual(rows.map((r) => [r.reason, r.carried, r.source, r.expiresAt?.toISOString().slice(0, 10)]), [
    ["SICKNESS", 6, "brought_forward", "2027-06-30"],
  ]);
});

test("expiry dates: sickness 18 months after the year end, family leave the next year end", () => {
  assert.equal(sicknessCarryExpiry(2026).toISOString(), "2028-06-30T23:59:59.999Z");
  assert.equal(familyLeaveCarryExpiry(2026).toISOString(), "2027-12-31T23:59:59.999Z");
});

test("never more than the days they were off: one sick day carries at most one day", () => {
  const { rows } = planYearEndCarryOver({ ...base, sicknessDays: 1, company: { ...base.company, enabled: false } });
  assert.deepEqual(rows.map((r) => [r.reason, r.carried]), [["SICKNESS", 1]]);
  // Hours: 2 days off × 7.5h = 15h, out of 80h untaken.
  const hours = planYearEndCarryOver({
    ...base,
    unit: "hours",
    entitlement: 120,
    takenBy: takenOn([["2026-02-01", 40]]),
    sicknessDays: 2,
    company: { ...base.company, enabled: false },
  });
  assert.deepEqual(hours.rows.map((r) => [r.reason, r.carried]), [["SICKNESS", 15]]);
});

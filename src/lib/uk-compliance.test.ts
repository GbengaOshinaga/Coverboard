import test from "node:test";
import assert from "node:assert/strict";
import {
  BankHolidayRegion,
  EmploymentType,
  SSP_MAX_WEEKS,
  UK_LEL_WEEKLY,
  UK_SSP_WEEKLY_RATE,
  calculateUkProRatedAnnualLeave,
  calculateBradfordFactor,
  calculateSspPayableDays,
  calculateSspDailyRate,
  calculateSspEntitlement,
  getUkBankHolidaysForRegion,
} from "@/lib/uk-compliance";

test("pro-rata for part-time contract", () => {
  const entitlement = calculateUkProRatedAnnualLeave({
    employmentType: EmploymentType.PART_TIME,
    daysWorkedPerWeek: 3,
    weeklyHours: [],
  });
  assert.equal(entitlement, 16.8);
});

test("Bradford factor formula", () => {
  const score = calculateBradfordFactor(5, 12);
  assert.equal(score, 300);
});

test("SSP waiting days logic", () => {
  const payable = calculateSspPayableDays(
    new Date("2026-01-05T00:00:00Z"),
    new Date("2026-01-09T00:00:00Z")
  );
  assert.equal(payable, 2);
});

test("UK bank holidays filtered by region", () => {
  const scotland = getUkBankHolidaysForRegion(2026, BankHolidayRegion.SCOTLAND);
  const england = getUkBankHolidaysForRegion(2026, BankHolidayRegion.ENGLAND_WALES);
  assert.ok(scotland.some((h) => h.name.includes("St Andrew")));
  assert.ok(!england.some((h) => h.name.includes("St Andrew")));
});

// ─── SSP daily rate — qualifying days per week ────────────────────────

test("SSP daily rate uses qualifying days — 5-day week", () => {
  const rate = calculateSspDailyRate(5, 116.75);
  // 116.75 / 5 = 23.35
  assert.equal(rate, 23.35);
});

test("SSP daily rate uses qualifying days — 4-day week", () => {
  const rate = calculateSspDailyRate(4, 116.75);
  // 116.75 / 4 = 29.1875 → rounded to 29.19
  assert.equal(rate, 29.19);
});

test("SSP daily rate uses qualifying days — 3-day week", () => {
  const rate = calculateSspDailyRate(3, 116.75);
  // 116.75 / 3 = 38.9166… → rounded to 38.92
  assert.equal(rate, 38.92);
});

test("SSP daily rate defaults to 5-day week when qualifyingDays missing/invalid", () => {
  assert.equal(calculateSspDailyRate(null, 116.75), 23.35);
  assert.equal(calculateSspDailyRate(undefined, 116.75), 23.35);
  assert.equal(calculateSspDailyRate(0, 116.75), 23.35);
  assert.equal(calculateSspDailyRate(8, 116.75), 23.35);
});

test("SSP daily rate does NOT use /7 — catches the HMRC-penalty bug", () => {
  const rate = calculateSspDailyRate(5, 116.75);
  const buggy = Number((116.75 / 7).toFixed(2));
  assert.notEqual(rate, buggy);
  assert.ok(rate > buggy);
});

// ─── SSP eligibility — Lower Earnings Limit boundary ──────────────────

test("SSP below LEL is not eligible", () => {
  const result = calculateSspEntitlement({
    averageWeeklyEarnings: UK_LEL_WEEKLY - 0.01,
    sspDaysPaidInPeriod: 0,
    qualifyingDaysPerWeek: 5,
  });
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.equal(result.reason, "Below Lower Earnings Limit");
  }
});

test("SSP exactly at LEL is eligible (inclusive boundary)", () => {
  const result = calculateSspEntitlement({
    averageWeeklyEarnings: UK_LEL_WEEKLY,
    sspDaysPaidInPeriod: 0,
    qualifyingDaysPerWeek: 5,
  });
  assert.equal(result.eligible, true);
  if (result.eligible) {
    assert.equal(result.dailyRate, calculateSspDailyRate(5));
  }
});

test("SSP above LEL is eligible", () => {
  const result = calculateSspEntitlement({
    averageWeeklyEarnings: UK_LEL_WEEKLY + 50,
    sspDaysPaidInPeriod: 0,
    qualifyingDaysPerWeek: 5,
  });
  assert.equal(result.eligible, true);
});

test("SSP missing average weekly earnings blocks eligibility", () => {
  const result = calculateSspEntitlement({
    averageWeeklyEarnings: null,
    sspDaysPaidInPeriod: 0,
    qualifyingDaysPerWeek: 5,
  });
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.equal(result.reason, "Missing average weekly earnings");
  }
});

// ─── SSP 28-week cumulative cap ───────────────────────────────────────

test("SSP 28-week cap — below limit is eligible (139 of 140 at 5-day week)", () => {
  const result = calculateSspEntitlement({
    averageWeeklyEarnings: 500,
    sspDaysPaidInPeriod: 139,
    qualifyingDaysPerWeek: 5,
  });
  assert.equal(result.eligible, true);
  if (result.eligible) {
    assert.equal(result.remainingDays, 1);
    assert.equal(result.maxDays, SSP_MAX_WEEKS * 5);
  }
});

test("SSP 28-week cap — exactly at 140 days stops SSP (5-day week)", () => {
  const result = calculateSspEntitlement({
    averageWeeklyEarnings: 500,
    sspDaysPaidInPeriod: 140,
    qualifyingDaysPerWeek: 5,
  });
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.equal(result.reason, "SSP 28-week limit reached");
  }
});

test("SSP 28-week cap — above 140 days stops SSP (5-day week)", () => {
  const result = calculateSspEntitlement({
    averageWeeklyEarnings: 500,
    sspDaysPaidInPeriod: 141,
    qualifyingDaysPerWeek: 5,
  });
  assert.equal(result.eligible, false);
});

test("SSP 28-week cap — scales with qualifying days (4-day week = 112 days)", () => {
  const underLimit = calculateSspEntitlement({
    averageWeeklyEarnings: 500,
    sspDaysPaidInPeriod: 111,
    qualifyingDaysPerWeek: 4,
  });
  const atLimit = calculateSspEntitlement({
    averageWeeklyEarnings: 500,
    sspDaysPaidInPeriod: 112,
    qualifyingDaysPerWeek: 4,
  });
  assert.equal(underLimit.eligible, true);
  assert.equal(atLimit.eligible, false);
  if (underLimit.eligible) {
    assert.equal(underLimit.maxDays, 28 * 4);
  }
});

test("SSP 28-week cap — scales with qualifying days (3-day week = 84 days)", () => {
  const underLimit = calculateSspEntitlement({
    averageWeeklyEarnings: 500,
    sspDaysPaidInPeriod: 83,
    qualifyingDaysPerWeek: 3,
  });
  const atLimit = calculateSspEntitlement({
    averageWeeklyEarnings: 500,
    sspDaysPaidInPeriod: 84,
    qualifyingDaysPerWeek: 3,
  });
  assert.equal(underLimit.eligible, true);
  assert.equal(atLimit.eligible, false);
});

test("SSP entitlement returns the correct daily rate for the employee's qualifying days", () => {
  const result = calculateSspEntitlement({
    averageWeeklyEarnings: 500,
    sspDaysPaidInPeriod: 0,
    qualifyingDaysPerWeek: 4,
    weeklyRate: 116.75,
  });
  assert.equal(result.eligible, true);
  if (result.eligible) {
    assert.equal(result.dailyRate, 29.19);
  }
});

test("UK_SSP_WEEKLY_RATE default is 116.75 (2024/25)", () => {
  // Guard against regression of the stale default rate.
  if (!process.env.SSP_WEEKLY_RATE) {
    assert.equal(UK_SSP_WEEKLY_RATE, 116.75);
  }
});

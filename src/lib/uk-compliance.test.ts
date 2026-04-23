import test from "node:test";
import assert from "node:assert/strict";
import {
  BankHolidayRegion,
  EmploymentType,
  FTE_STANDARD_HOURS_PER_WEEK,
  SSP_MAX_WEEKS,
  UK_LEL_WEEKLY,
  UK_SSP_WEEKLY_RATE,
  calculateUkProRatedAnnualLeave,
  calculateVariableHoursFte,
  calculateBradfordFactor,
  calculateSspPayableDays,
  calculateSspDailyRate,
  calculateSspEntitlement,
  easterSunday,
  getUkBankHolidaysForRegion,
} from "@/lib/uk-compliance";

// ─── Pro-rata entitlement ─────────────────────────────────────────────

test("pro-rata for part-time 3 days/week rounds UP to whole day (WTR)", () => {
  const entitlement = calculateUkProRatedAnnualLeave({
    employmentType: EmploymentType.PART_TIME,
    daysWorkedPerWeek: 3,
    weeklyHours: [],
  });
  // Math.ceil((3/5)*28) = Math.ceil(16.8) = 17
  assert.equal(entitlement, 17);
});

test("pro-rata for part-time 4 days/week rounds UP to whole day (WTR)", () => {
  const entitlement = calculateUkProRatedAnnualLeave({
    employmentType: EmploymentType.PART_TIME,
    daysWorkedPerWeek: 4,
    weeklyHours: [],
  });
  // Math.ceil((4/5)*28) = Math.ceil(22.4) = 23
  assert.equal(entitlement, 23);
});

test("pro-rata for part-time 2.5 days/week", () => {
  const entitlement = calculateUkProRatedAnnualLeave({
    employmentType: EmploymentType.PART_TIME,
    daysWorkedPerWeek: 2.5,
    weeklyHours: [],
  });
  // Math.ceil((2.5/5)*28) = Math.ceil(14.0) = 14
  assert.equal(entitlement, 14);
});

test("pro-rata for variable hours at 35-hour FTE, 28 hours/week", () => {
  // FTE = 28/35 = 0.8 → Math.ceil(0.8 * 28) = Math.ceil(22.4) = 23
  const weeklyHours = Array(52).fill(28);
  const entitlement = calculateUkProRatedAnnualLeave({
    employmentType: EmploymentType.VARIABLE_HOURS,
    daysWorkedPerWeek: 0,
    weeklyHours,
    fullTimeHoursPerWeek: 35,
  });
  assert.equal(entitlement, 23);
});

test("pro-rata for full-time employee is always 28 regardless of applyProRata", () => {
  const entitlement = calculateUkProRatedAnnualLeave({
    employmentType: EmploymentType.FULL_TIME,
    daysWorkedPerWeek: 5,
    weeklyHours: [],
  });
  assert.equal(entitlement, 28);
});

test("FTE_STANDARD_HOURS_PER_WEEK constant is 37.5", () => {
  assert.equal(FTE_STANDARD_HOURS_PER_WEEK, 37.5);
});

test("calculateVariableHoursFte respects custom fullTimeHoursPerWeek", () => {
  const fte = calculateVariableHoursFte(Array(52).fill(35), 35);
  assert.equal(fte, 1.0);
});

test("calculateVariableHoursFte uses FTE_STANDARD_HOURS_PER_WEEK as default", () => {
  const fte = calculateVariableHoursFte(Array(52).fill(37.5));
  assert.equal(fte, 1.0);
});

// ─── Bradford Factor ──────────────────────────────────────────────────

test("Bradford factor formula", () => {
  const score = calculateBradfordFactor(5, 12);
  assert.equal(score, 300);
});

// ─── SSP waiting days ─────────────────────────────────────────────────

test("SSP waiting days logic", () => {
  const payable = calculateSspPayableDays(
    new Date("2026-01-05T00:00:00Z"),
    new Date("2026-01-09T00:00:00Z")
  );
  assert.equal(payable, 2);
});

// ─── UK bank holidays filtered by region ─────────────────────────────

test("UK bank holidays filtered by region", () => {
  const scotland = getUkBankHolidaysForRegion(2026, BankHolidayRegion.SCOTLAND);
  const england = getUkBankHolidaysForRegion(2026, BankHolidayRegion.ENGLAND_WALES);
  assert.ok(scotland.some((h) => h.name.includes("St Andrew")));
  assert.ok(!england.some((h) => h.name.includes("St Andrew")));
});

// ─── Easter algorithm ─────────────────────────────────────────────────

test("easterSunday 2026 = 5 April (matches hardcoded bank holiday)", () => {
  const easter = easterSunday(2026);
  assert.equal(easter.toISOString().slice(0, 10), "2026-04-05");
});

test("easterSunday 2027 = 28 March (matches hardcoded bank holiday)", () => {
  const easter = easterSunday(2027);
  assert.equal(easter.toISOString().slice(0, 10), "2027-03-28");
});

test("getUkBankHolidaysForRegion uses algorithm for years beyond hardcoded table", () => {
  const holidays2028 = getUkBankHolidaysForRegion(2028, BankHolidayRegion.ENGLAND_WALES);
  assert.ok(holidays2028.length > 0, "should return holidays for 2028");
  assert.ok(holidays2028.some((h) => h.name === "Good Friday"), "should include Good Friday");
  assert.ok(holidays2028.some((h) => h.name === "Easter Monday"), "should include Easter Monday");
});

test("algorithmic 2028 Good Friday = 14 April", () => {
  // Easter 2028 = April 16 → Good Friday = April 14
  const holidays = getUkBankHolidaysForRegion(2028, BankHolidayRegion.ENGLAND_WALES);
  const gf = holidays.find((h) => h.name === "Good Friday");
  assert.ok(gf);
  assert.equal(gf!.date.toISOString().slice(0, 10), "2028-04-14");
});

test("Scotland bank holidays include 2nd January but not Easter Monday", () => {
  const scotland = getUkBankHolidaysForRegion(2028, BankHolidayRegion.SCOTLAND);
  assert.ok(scotland.some((h) => h.name.startsWith("2nd January")));
  assert.ok(!scotland.some((h) => h.name === "Easter Monday"));
});

test("Northern Ireland bank holidays include St Patrick's Day", () => {
  const ni = getUkBankHolidaysForRegion(2028, BankHolidayRegion.NORTHERN_IRELAND);
  assert.ok(ni.some((h) => h.name === "St Patrick's Day"));
});

// ─── SSP daily rate — qualifying days per week ────────────────────────

test("SSP daily rate uses qualifying days — 5-day week", () => {
  const rate = calculateSspDailyRate(5, 123.25);
  // 123.25 / 5 = 24.65
  assert.equal(rate, 24.65);
});

test("SSP daily rate uses qualifying days — 4-day week", () => {
  const rate = calculateSspDailyRate(4, 123.25);
  // 123.25 / 4 = 30.8125 → rounded to 30.81
  assert.equal(rate, 30.81);
});

test("SSP daily rate uses qualifying days — 3-day week", () => {
  const rate = calculateSspDailyRate(3, 123.25);
  // 123.25 / 3 = 41.0833… → rounded to 41.08
  assert.equal(rate, 41.08);
});

test("SSP daily rate defaults to 5-day week when qualifyingDays missing/invalid", () => {
  assert.equal(calculateSspDailyRate(null, 123.25), 24.65);
  assert.equal(calculateSspDailyRate(undefined, 123.25), 24.65);
  assert.equal(calculateSspDailyRate(0, 123.25), 24.65);
  assert.equal(calculateSspDailyRate(8, 123.25), 24.65);
});

test("SSP daily rate does NOT use /7 — catches the HMRC-penalty bug", () => {
  const rate = calculateSspDailyRate(5, 123.25);
  const buggy = Number((123.25 / 7).toFixed(2));
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
    weeklyRate: 123.25,
  });
  assert.equal(result.eligible, true);
  if (result.eligible) {
    assert.equal(result.dailyRate, 30.81);
  }
});

test("UK_SSP_WEEKLY_RATE default is 123.25 (2026/27)", () => {
  if (!process.env.SSP_WEEKLY_RATE) {
    assert.equal(UK_SSP_WEEKLY_RATE, 123.25);
  }
});

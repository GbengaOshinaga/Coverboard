import test from "node:test";
import assert from "node:assert/strict";
import { adjustAllowanceForBankHolidays } from "./leave-balances";

// UK England/Wales has 8 bank holidays. The statutory minimum (28 days) is
// inclusive of those, so flipping the inclusive/exclusive toggle must never
// change the total time off — only how the Annual Leave bucket is reported.
//
// UK-ness is keyed off `workCountry` (not the legacy `countryCode`) so the
// accounting moves in lock-step with the settings toggle's visibility, which
// `hasUKEmployees` also gates off `workCountry`.
const GB_AL = {
  allowance: 28,
  workCountry: "GB",
  leaveTypeName: "Annual Leave",
  ukRegionalBankHolidayCount: 8,
};

test("inclusive mode leaves the statutory allowance untouched (28)", () => {
  const result = adjustAllowanceForBankHolidays({
    ...GB_AL,
    ukBankHolidayInclusive: true,
  });
  assert.equal(result, 28);
});

test("exclusive mode subtracts bank holidays so the bucket is discretionary (28 - 8 = 20)", () => {
  const result = adjustAllowanceForBankHolidays({
    ...GB_AL,
    ukBankHolidayInclusive: false,
  });
  // Regression: this previously *added* the bank holidays, inflating to 36.
  assert.equal(result, 20);
});

test("total time off is unchanged across both modes (20 discretionary + 8 BH = 28)", () => {
  const inclusive = adjustAllowanceForBankHolidays({
    ...GB_AL,
    ukBankHolidayInclusive: true,
  });
  const exclusive = adjustAllowanceForBankHolidays({
    ...GB_AL,
    ukBankHolidayInclusive: false,
  });
  assert.equal(inclusive, exclusive + GB_AL.ukRegionalBankHolidayCount);
});

test("null workCountry is never adjusted — matches the hidden settings toggle", () => {
  // Britannia-style org: countryCode=GB but workCountry unset. The settings
  // page hides the toggle (hasUKEmployees keys off workCountry), so the
  // accounting must likewise not apply the split — otherwise the allowance
  // would change with no visible control governing it.
  const result = adjustAllowanceForBankHolidays({
    allowance: 28,
    workCountry: null,
    leaveTypeName: "Annual Leave",
    ukBankHolidayInclusive: false,
    ukRegionalBankHolidayCount: 8,
  });
  assert.equal(result, 28);
});

test("non-GB workCountry is never adjusted", () => {
  const result = adjustAllowanceForBankHolidays({
    allowance: 25,
    workCountry: "NG",
    leaveTypeName: "Annual Leave",
    ukBankHolidayInclusive: false,
    ukRegionalBankHolidayCount: 8,
  });
  assert.equal(result, 25);
});

test("non-Annual-Leave UK types are never adjusted", () => {
  const result = adjustAllowanceForBankHolidays({
    allowance: 10,
    workCountry: "GB",
    leaveTypeName: "Sick Leave",
    ukBankHolidayInclusive: false,
    ukRegionalBankHolidayCount: 8,
  });
  assert.equal(result, 10);
});

test("a pro-rated base is reduced correctly in exclusive mode", () => {
  // Part-time worker pro-rated to 14 days; Scotland has up to 9 bank holidays.
  const result = adjustAllowanceForBankHolidays({
    allowance: 14,
    workCountry: "GB",
    leaveTypeName: "Annual Leave",
    ukBankHolidayInclusive: false,
    ukRegionalBankHolidayCount: 9,
  });
  assert.equal(result, 5);
});

test("allowance never goes negative when bank holidays exceed the base", () => {
  const result = adjustAllowanceForBankHolidays({
    allowance: 5,
    workCountry: "GB",
    leaveTypeName: "Annual Leave",
    ukBankHolidayInclusive: false,
    ukRegionalBankHolidayCount: 8,
  });
  assert.equal(result, 0);
});

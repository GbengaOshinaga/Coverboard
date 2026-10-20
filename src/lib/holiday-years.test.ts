import test from "node:test";
import assert from "node:assert/strict";
import { holidayYears } from "./holiday-years";
import { getUkBankHolidaysForRegion } from "./uk-compliance";

test("teams always hold this year's and next year's holidays", () => {
  assert.deepEqual(holidayYears(new Date(Date.UTC(2027, 0, 1))), [2027, 2028]);
  assert.deepEqual(holidayYears(new Date(Date.UTC(2026, 11, 31))), [2026, 2027]);
});

test("bank holidays are worked out for any year: 2028 in England and Wales", () => {
  const days = getUkBankHolidaysForRegion(2028, "ENGLAND_WALES").map((h) => h.date.toISOString().slice(0, 10));
  // 1 January 2028 is a Saturday, so the bank holiday is Monday 3rd; Easter Sunday is 16 April.
  assert.deepEqual(days, ["2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  HOLIDAY_PAY_NOT_APPLICABLE_ERROR,
  holidayPayNotApplicablePayload,
  isUkHolidayPayApplicable,
} from "@/lib/uk-holiday-pay";

test("earnings history API guard payload uses NOT_APPLICABLE for non-GB", () => {
  const payload = holidayPayNotApplicablePayload();
  assert.equal(payload.error, HOLIDAY_PAY_NOT_APPLICABLE_ERROR);
  assert.ok(payload.message.includes("UK-based employees"));
});

test("isUkHolidayPayApplicable only allows GB", () => {
  assert.equal(isUkHolidayPayApplicable("GB"), true);
  assert.equal(isUkHolidayPayApplicable("NG"), false);
  assert.equal(isUkHolidayPayApplicable(null), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildPayrollHolidayRateFields } from "@/lib/payroll-export";

test("payroll export omits holiday pay rate fields for non-GB employees", () => {
  const row = buildPayrollHolidayRateFields({
    isUkBased: false,
    dailyRate: 95.5,
    estimatedPay: 286.5,
    rateSource: "recalculated",
  });
  assert.deepEqual(row, {});
});

test("payroll export includes holiday pay rate fields for GB employees", () => {
  const row = buildPayrollHolidayRateFields({
    isUkBased: true,
    dailyRate: 95.5,
    estimatedPay: 286.5,
    rateSource: "recalculated",
  });
  assert.equal("dailyHolidayPayRate" in row, true);
  assert.equal("estimatedPay" in row, true);
  assert.equal("rateSource" in row, true);
});

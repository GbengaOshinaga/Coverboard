import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultLeaveTypes,
  getCountryPolicies,
  getHolidaysForYear,
} from "@/lib/country-policies";

test("getDefaultLeaveTypes keeps the highest allowance per leave type", () => {
  const defaults = getDefaultLeaveTypes(["GB", "NG"]);
  const annual = defaults.find((d) => d.name === "Annual Leave");
  assert.ok(annual);
  assert.equal(annual.defaultDays, 28);
});

test("getCountryPolicies applies derived defaults for optional fields", () => {
  const policies = getCountryPolicies(["NG"]);
  const annual = policies.find(
    (p) => p.countryCode === "NG" && p.leaveType === "Annual Leave"
  );
  assert.ok(annual);
  assert.equal(annual.category, "PAID");
  assert.equal(annual.requiresEvidence, false);
  assert.equal(annual.minNoticeDays, 0);
  assert.equal(annual.durationLogic, null);
});

test("getHolidaysForYear returns expected dated holidays by country", () => {
  const holidays = getHolidaysForYear(["NG"], 2026);
  const independence = holidays.find((h) => h.name === "Independence Day");
  assert.ok(independence);
  assert.equal(independence.countryCode, "NG");
  assert.equal(independence.date.getFullYear(), 2026);
  assert.equal(independence.date.getMonth(), 9);
  assert.equal(independence.date.getDate(), 1);
});

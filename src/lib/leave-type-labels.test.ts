import test from "node:test";
import assert from "node:assert/strict";
import { allowanceLabel } from "./leave-type-labels";
import { baseLeaveTypesFor, getDefaultLeaveTypes } from "./country-policies";

test("allowanceLabel: SSP, sickness, weeks and days", () => {
  assert.equal(allowanceLabel({ name: "Statutory Sick Pay (SSP)", defaultDays: 0 }), "Up to 28 weeks per absence");
  assert.equal(allowanceLabel({ name: "Sick Leave", defaultDays: 0 }), "Tracked per absence");
  assert.equal(allowanceLabel({ name: "Sick Leave", defaultDays: 10 }), "10 days");
  assert.equal(allowanceLabel({ name: "Statutory Maternity Leave", defaultDays: 52, allowanceUnit: "WEEKS" }), "52 weeks");
  assert.equal(allowanceLabel({ name: "Carer's Leave", defaultDays: 1, allowanceUnit: "WEEKS" }), "1 week");
  assert.equal(allowanceLabel({ name: "Annual Leave", defaultDays: 28, allowanceUnit: "DAYS" }), "28 days");
});

test("UK-only teams don't get the generic Sick Leave alongside SSP", () => {
  assert.equal(baseLeaveTypesFor(["GB"]).some((t) => t.name === "Sick Leave"), false);
  assert.equal(baseLeaveTypesFor(["GB", "NG"]).some((t) => t.name === "Sick Leave"), true);
  const uk = getDefaultLeaveTypes(["GB"]);
  assert.equal(uk.some((t) => t.name === "Sick Leave"), false);
  assert.equal(uk.find((t) => t.name === "Statutory Maternity Leave")?.allowanceUnit, "WEEKS");
});

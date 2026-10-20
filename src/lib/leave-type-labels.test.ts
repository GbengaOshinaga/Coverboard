import test from "node:test";
import assert from "node:assert/strict";
import { allowanceLabel, compareLeaveTypesForList, leaveTypeGroup, leaveTypeListHint, leaveTypeListName } from "./leave-type-labels";
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

test("leave-type list: everyday leave first in order of use, then family leave", () => {
  const names = [
    "Adoption Leave", "Annual Leave", "Carer's Leave", "Neonatal Care Leave", "Parental Bereavement Leave",
    "Shared Parental Leave (SPL)", "Statutory Maternity Leave", "Statutory Paternity Leave",
    "Statutory Sick Pay (SSP)", "Unpaid Leave", "Unpaid Parental Leave", "Compassionate Leave",
  ];
  const sorted = names.map((name) => ({ name })).sort(compareLeaveTypesForList).map((t) => t.name);
  assert.deepEqual(sorted.slice(0, 5), ["Annual Leave", "Statutory Sick Pay (SSP)", "Unpaid Leave", "Carer's Leave", "Compassionate Leave"]);
  assert.ok(sorted.slice(5).every((n) => leaveTypeGroup(n) === "Family leave"));
  assert.equal(leaveTypeGroup("Unpaid Leave"), "Everyday");
  assert.equal(leaveTypeListName("Statutory Sick Pay (SSP)"), "Sickness (SSP)");
});

test("leave-type list hints: balance left, 'up to' for leave per birth or loss, nothing without an allowance", () => {
  assert.equal(leaveTypeListHint({ name: "Annual Leave", defaultDays: 28 }, { allowance: 28, remaining: 20 }), "20 days left");
  assert.equal(
    leaveTypeListHint({ name: "Statutory Maternity Leave", defaultDays: 52, allowanceUnit: "WEEKS" }, { allowance: 260, remaining: 260 }),
    "up to 52 weeks"
  );
  assert.equal(leaveTypeListHint({ name: "Statutory Sick Pay (SSP)", defaultDays: 0 }, { allowance: 0, remaining: 0 }), null);
  assert.equal(leaveTypeListHint({ name: "Unpaid Leave", defaultDays: 0 }, { allowance: 0, remaining: 0 }), null);
  assert.equal(leaveTypeListHint({ name: "Neonatal Care Leave", defaultDays: 12, allowanceUnit: "WEEKS" }, null), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  BankHolidayRegion,
  EmploymentType,
  calculateUkProRatedAnnualLeave,
  calculateBradfordFactor,
  calculateSspPayableDays,
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

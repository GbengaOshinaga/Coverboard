import test from "node:test";
import assert from "node:assert/strict";
import {
  formatEmploymentType,
  normalizeEmploymentType,
} from "@/lib/employment-types";

test("CSV import accepts ZERO_HOURS employment type", () => {
  assert.equal(normalizeEmploymentType("ZERO_HOURS"), "ZERO_HOURS");
});

test("CSV import maps common zero-hours variations", () => {
  for (const value of [
    "ZERO_HOURS",
    "zero_hours",
    "zero hours",
    "Zero Hours",
    "zerohours",
  ]) {
    assert.equal(normalizeEmploymentType(value), "ZERO_HOURS");
  }
});

test("employment type label renders Zero-hours contract", () => {
  assert.equal(formatEmploymentType("ZERO_HOURS"), "Zero-hours contract");
});

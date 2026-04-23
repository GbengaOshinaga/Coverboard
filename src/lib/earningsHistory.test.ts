import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEarningsCsv,
  findIntraFileDuplicates,
  findDuplicatesAgainstExisting,
  isMonday,
  nearestPastMonday,
} from "@/lib/earningsHistory";

// ─── isMonday ─────────────────────────────────────────────────────────

test("isMonday correctly identifies Monday", () => {
  assert.equal(isMonday("2026-01-05"), true);  // Monday
  assert.equal(isMonday("2026-04-13"), true);  // Monday
});

test("isMonday rejects non-Monday weekdays", () => {
  assert.equal(isMonday("2026-01-06"), false); // Tuesday
  assert.equal(isMonday("2026-01-07"), false); // Wednesday
  assert.equal(isMonday("2026-01-10"), false); // Saturday
  assert.equal(isMonday("2026-01-11"), false); // Sunday
});

test("isMonday rejects invalid date strings", () => {
  assert.equal(isMonday("not-a-date"), false);
  assert.equal(isMonday(""), false);
  assert.equal(isMonday("01/05/2026"), false);
});

// ─── nearestPastMonday ───────────────────────────────────────────────

test("nearestPastMonday returns a Monday", () => {
  const result = nearestPastMonday(new Date("2026-04-18T00:00:00Z")); // Saturday
  assert.equal(result, "2026-04-13");
  assert.equal(isMonday(result), true);
});

test("nearestPastMonday returns the same Monday when given a Monday", () => {
  const result = nearestPastMonday(new Date("2026-04-13T00:00:00Z"));
  assert.equal(result, "2026-04-13");
});

// ─── parseEarningsCsv — valid rows ──────────────────────────────────

test("parseEarningsCsv parses a well-formed CSV correctly", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-05,650.00,37.5,false",
    "2026-01-12,720.50,40.0,false",
  ].join("\n");

  const { valid, errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(valid.length, 2);
  assert.equal(valid[0].weekStartDate, "2026-01-05");
  assert.equal(valid[0].grossEarnings, 650);
  assert.equal(valid[0].hoursWorked, 37.5);
  assert.equal(valid[0].isZeroPayWeek, false);
});

test("parseEarningsCsv accepts zero_pay_week = true without earnings/hours", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-19,0,0,true",
  ].join("\n");

  const { valid, errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].isZeroPayWeek, true);
  assert.equal(valid[0].grossEarnings, 0);
});

test("parseEarningsCsv ignores CRLF line endings", () => {
  const csv = "week_starting,gross_earnings,hours_worked,zero_pay_week\r\n2026-01-05,500,37.5,false\r\n";
  const { valid, errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(valid.length, 1);
});

// ─── parseEarningsCsv — error cases ─────────────────────────────────

test("parseEarningsCsv errors on missing required column", () => {
  const csv = "week_starting,gross_earnings,hours_worked\n2026-01-05,500,37.5";
  const { valid, errors } = parseEarningsCsv(csv);
  assert.equal(valid.length, 0);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].error.includes("zero_pay_week"));
});

test("parseEarningsCsv errors on invalid date format", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "05/01/2026,500,37.5,false",
  ].join("\n");

  const { errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].error.includes("YYYY-MM-DD"));
});

test("parseEarningsCsv errors when week_starting is not a Monday", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-06,500,37.5,false", // Tuesday
  ].join("\n");

  const { errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].error.includes("Monday"));
});

test("parseEarningsCsv errors on negative gross_earnings", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-05,-50,37.5,false",
  ].join("\n");

  const { errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].error.includes("negative"));
});

test("parseEarningsCsv errors on missing gross_earnings when not zero pay", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-05,,37.5,false",
  ].join("\n");

  const { errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].error.includes("required"));
});

test("parseEarningsCsv errors on non-numeric gross_earnings", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-05,abc,37.5,false",
  ].join("\n");

  const { errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].error.includes("valid number"));
});

test("parseEarningsCsv errors on hours_worked > 168", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-05,500,200,false",
  ].join("\n");

  const { errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].error.includes("hours_worked"));
});

test("parseEarningsCsv partial import — valid rows succeed, bad rows error", () => {
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-05,650,37.5,false",
    "2026-01-06,-50,37.5,false", // Tuesday + negative
    "2026-01-12,720,40.0,false",
  ].join("\n");

  const { valid, errors } = parseEarningsCsv(csv);
  assert.equal(valid.length, 2);
  assert.equal(errors.length, 1);
});

test("parseEarningsCsv returns error for empty file", () => {
  const { valid, errors } = parseEarningsCsv("   ");
  assert.equal(valid.length, 0);
  assert.equal(errors.length, 1);
});

// ─── findIntraFileDuplicates ─────────────────────────────────────────

test("findIntraFileDuplicates detects duplicate week_starting in file", () => {
  const rows = [
    { weekStartDate: "2026-01-05", grossEarnings: 500, hoursWorked: 37.5, isZeroPayWeek: false },
    { weekStartDate: "2026-01-12", grossEarnings: 600, hoursWorked: 40, isZeroPayWeek: false },
    { weekStartDate: "2026-01-05", grossEarnings: 550, hoursWorked: 37.5, isZeroPayWeek: false },
  ];
  const dupes = findIntraFileDuplicates(rows);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].rowIndex, 3);
  assert.ok(dupes[0].error.includes("2026-01-05"));
});

test("findIntraFileDuplicates returns empty array when no duplicates", () => {
  const rows = [
    { weekStartDate: "2026-01-05", grossEarnings: 500, hoursWorked: 37.5, isZeroPayWeek: false },
    { weekStartDate: "2026-01-12", grossEarnings: 600, hoursWorked: 40, isZeroPayWeek: false },
  ];
  assert.equal(findIntraFileDuplicates(rows).length, 0);
});

// ─── findDuplicatesAgainstExisting ──────────────────────────────────

test("findDuplicatesAgainstExisting flags rows that already exist in DB", () => {
  const rows = [
    { weekStartDate: "2026-01-05", grossEarnings: 500, hoursWorked: 37.5, isZeroPayWeek: false },
    { weekStartDate: "2026-01-12", grossEarnings: 600, hoursWorked: 40, isZeroPayWeek: false },
  ];
  const existing = ["2026-01-05"];
  const dupes = findDuplicatesAgainstExisting(rows, existing);
  assert.equal(dupes.length, 1);
  assert.ok(dupes[0].error.includes("already exist"));
});

test("findDuplicatesAgainstExisting returns empty when no overlap", () => {
  const rows = [
    { weekStartDate: "2026-01-19", grossEarnings: 500, hoursWorked: 37.5, isZeroPayWeek: false },
  ];
  const existing = ["2026-01-05", "2026-01-12"];
  assert.equal(findDuplicatesAgainstExisting(rows, existing).length, 0);
});

// ─── zero pay week disables earnings/hours requirement ───────────────

test("parseEarningsCsv: zero_pay_week=true with non-zero values still imports (gross overridden to 0)", () => {
  // When isZeroPayWeek is true, we ignore the gross_earnings column value
  const csv = [
    "week_starting,gross_earnings,hours_worked,zero_pay_week",
    "2026-01-05,500,37.5,true",
  ].join("\n");

  const { valid, errors } = parseEarningsCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].isZeroPayWeek, true);
  assert.equal(valid[0].grossEarnings, 0);
  assert.equal(valid[0].hoursWorked, 0);
});

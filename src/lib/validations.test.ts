import test from "node:test";
import assert from "node:assert/strict";
import {
  leaveRequestSchema,
  teamMemberSchema,
  leaveTypeSchema,
  leaveTypeUpdateSchema,
} from "@/lib/validations";

test("leaveRequestSchema rejects end date before start date", () => {
  const result = leaveRequestSchema.safeParse({
    startDate: "2026-05-10",
    endDate: "2026-05-09",
    leaveTypeId: "lt_1",
  });
  assert.equal(result.success, false);
});

test("teamMemberSchema applies defaults for employmentType and numeric fields", () => {
  const result = teamMemberSchema.safeParse({
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "MEMBER",
    memberType: "EMPLOYEE",
    countryCode: "GB",
    workCountry: "GB",
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.employmentType, "FULL_TIME");
  assert.equal(result.data.daysWorkedPerWeek, 5);
  assert.equal(result.data.fteRatio, 1);
});

test("teamMemberSchema accepts ZERO_HOURS and stores days worked as 0", () => {
  const result = teamMemberSchema.safeParse({
    name: "Cara Patel",
    email: "cara@example.com",
    role: "MEMBER",
    memberType: "EMPLOYEE",
    employmentType: "ZERO_HOURS",
    daysWorkedPerWeek: 5,
    fteRatio: 0,
    countryCode: "GB",
    workCountry: "GB",
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.employmentType, "ZERO_HOURS");
  assert.equal(result.data.daysWorkedPerWeek, 0);
});

test("leaveTypeSchema enforces hex color format", () => {
  const result = leaveTypeSchema.safeParse({
    name: "Annual Leave",
    color: "blue",
    isPaid: true,
    defaultDays: 25,
  });
  assert.equal(result.success, false);
});

// ---------- Scale-tier custom leave type fields ----------

test("leaveTypeSchema accepts the policy-builder fields when supplied", () => {
  const result = leaveTypeSchema.safeParse({
    name: "Study Leave",
    color: "#6366f1",
    isPaid: false,
    defaultDays: 5,
    category: "UNPAID",
    requiresEvidence: true,
    minNoticeDays: 14,
    applyProRata: true,
    countryCode: "GB",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.category, "UNPAID");
    assert.equal(result.data.requiresEvidence, true);
    assert.equal(result.data.minNoticeDays, 14);
    assert.equal(result.data.applyProRata, true);
    assert.equal(result.data.countryCode, "GB");
  }
});

test("leaveTypeSchema treats the new fields as optional (basic shape still passes)", () => {
  const result = leaveTypeSchema.safeParse({
    name: "Annual Leave",
    color: "#6366f1",
    isPaid: true,
    defaultDays: 25,
  });
  assert.equal(result.success, true);
});

test("leaveTypeSchema rejects an invalid category enum", () => {
  const result = leaveTypeSchema.safeParse({
    name: "Foo",
    color: "#6366f1",
    isPaid: true,
    defaultDays: 5,
    category: "BONUS",
  });
  assert.equal(result.success, false);
});

test("leaveTypeSchema rejects negative minNoticeDays", () => {
  const result = leaveTypeSchema.safeParse({
    name: "Foo",
    color: "#6366f1",
    isPaid: true,
    defaultDays: 5,
    minNoticeDays: -1,
  });
  assert.equal(result.success, false);
});

test("leaveTypeSchema rejects a 3-letter country code (alpha-3 instead of alpha-2)", () => {
  const result = leaveTypeSchema.safeParse({
    name: "Foo",
    color: "#6366f1",
    isPaid: true,
    defaultDays: 5,
    countryCode: "GBR",
  });
  assert.equal(result.success, false);
});

test("leaveTypeSchema accepts null countryCode (means 'no country restriction')", () => {
  const result = leaveTypeSchema.safeParse({
    name: "Foo",
    color: "#6366f1",
    isPaid: true,
    defaultDays: 5,
    countryCode: null,
  });
  assert.equal(result.success, true);
});

test("leaveTypeSchema uppercases lower-case country codes", () => {
  const result = leaveTypeSchema.safeParse({
    name: "Foo",
    color: "#6366f1",
    isPaid: true,
    defaultDays: 5,
    countryCode: "gb",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.countryCode, "GB");
  }
});

test("leaveTypeUpdateSchema treats every field as optional (partial PATCH)", () => {
  // Just changing the name should be valid for an update.
  const result = leaveTypeUpdateSchema.safeParse({ name: "Renamed" });
  assert.equal(result.success, true);

  // Empty object is also valid (no-op update — guarded at the route layer).
  const empty = leaveTypeUpdateSchema.safeParse({});
  assert.equal(empty.success, true);
});

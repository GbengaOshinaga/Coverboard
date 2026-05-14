import test from "node:test";
import assert from "node:assert/strict";
import {
  leaveRequestSchema,
  teamMemberSchema,
  leaveTypeSchema,
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

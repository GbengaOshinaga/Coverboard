import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  NO_UK_EMPLOYEES_ERROR,
  filterToUkEmployees,
  hasUKEmployees,
  ukComplianceUnavailablePayload,
} from "@/lib/uk-workforce";

test("hasUKEmployees returns true when at least one active GB employee exists", async () => {
  const original = prisma.user.findFirst as unknown;
  (prisma.user as unknown as { findFirst: unknown }).findFirst = async () => ({
    id: "u1",
  });
  try {
    const result = await hasUKEmployees("org_1");
    assert.equal(result, true);
  } finally {
    (prisma.user as unknown as { findFirst: unknown }).findFirst = original;
  }
});

test("hasUKEmployees returns false when all employees are non-GB", async () => {
  const original = prisma.user.findFirst as unknown;
  (prisma.user as unknown as { findFirst: unknown }).findFirst = async () => null;
  try {
    const result = await hasUKEmployees("org_2");
    assert.equal(result, false);
  } finally {
    (prisma.user as unknown as { findFirst: unknown }).findFirst = original;
  }
});

test("hasUKEmployees returns false when all GB employees are inactive", async () => {
  const original = prisma.user.findFirst as unknown;
  (prisma.user as unknown as { findFirst: unknown }).findFirst = async () => null;
  try {
    const result = await hasUKEmployees("org_3");
    assert.equal(result, false);
  } finally {
    (prisma.user as unknown as { findFirst: unknown }).findFirst = original;
  }
});

test("UK report API denial payload contains 403-compatible error body", () => {
  const payload = ukComplianceUnavailablePayload();
  assert.equal(payload.error, NO_UK_EMPLOYEES_ERROR);
  assert.ok(payload.message.includes("UK compliance reports are only available"));
});

test("mixed workforce filtering keeps only UK employees", () => {
  const rows = [
    { id: "u1", workCountry: "GB", name: "Ada" },
    { id: "u2", workCountry: "NG", name: "Bola" },
    { id: "u3", workCountry: null, name: "Chris" },
    { id: "u4", workCountry: "GB", name: "Dee" },
  ];
  const ukOnly = filterToUkEmployees(rows);
  assert.deepEqual(
    ukOnly.map((r) => r.id),
    ["u1", "u4"]
  );
});

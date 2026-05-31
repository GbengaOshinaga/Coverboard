import test from "node:test";
import assert from "node:assert/strict";
import {
  planAtLeast,
  PLAN_DEFAULT_MAX_ADMINS,
  PLAN_MAX_EMPLOYEES,
  maxAdminsForPlan,
  maxEmployeesForPlan,
  hasPrioritySupport,
  hasSlaSupport,
  hasAuditTrail,
} from "@/lib/plans";

test("planAtLeast respects tier ordering across the full 5-tier ladder", () => {
  assert.equal(planAtLeast("STARTER", "FREE"), true);
  assert.equal(planAtLeast("GROWTH", "STARTER"), true);
  assert.equal(planAtLeast("SCALE", "GROWTH"), true);
  assert.equal(planAtLeast("PRO", "SCALE"), true);
  assert.equal(planAtLeast("FREE", "STARTER"), false);
  assert.equal(planAtLeast("STARTER", "GROWTH"), false);
});

test("planAtLeast rejects non-ranked lifecycle plans", () => {
  // TRIAL is intentionally NOT a ranked tier — feature gates use the
  // PRO-equivalent path via normalizeForFeatureGate, but planAtLeast
  // explicitly excludes lifecycle plans from the rank comparison.
  assert.equal(planAtLeast("TRIAL", "STARTER"), false);
  assert.equal(planAtLeast("LOCKED", "STARTER"), false);
});

test("response and audit gates unlock at expected tiers", () => {
  assert.equal(hasPrioritySupport("SCALE"), true);
  assert.equal(hasPrioritySupport("GROWTH"), false);
  assert.equal(hasSlaSupport("PRO"), true);
  assert.equal(hasSlaSupport("SCALE"), false);
  assert.equal(hasAuditTrail("PRO"), true);
  assert.equal(hasAuditTrail("GROWTH"), false);
});

test("TRIAL inherits Pro gate access", () => {
  assert.equal(hasPrioritySupport("TRIAL"), true);
  assert.equal(hasSlaSupport("TRIAL"), true);
  assert.equal(hasAuditTrail("TRIAL"), true);
});

test("admin caps match the launch pricing structure", () => {
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.FREE, 1);
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.STARTER, 2);
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.GROWTH, 5);
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.SCALE, 0);
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.PRO, 0);
});

test("employee caps match the launch pricing structure", () => {
  assert.equal(PLAN_MAX_EMPLOYEES.FREE, 5);
  assert.equal(PLAN_MAX_EMPLOYEES.STARTER, 15);
  assert.equal(PLAN_MAX_EMPLOYEES.GROWTH, 0);
  assert.equal(PLAN_MAX_EMPLOYEES.SCALE, 0);
  assert.equal(PLAN_MAX_EMPLOYEES.PRO, 0);
});

// ---------- maxAdminsForPlan: lifecycle plan handling ----------

test("maxAdminsForPlan returns Infinity for unlimited tiers", () => {
  assert.equal(maxAdminsForPlan("SCALE"), Infinity);
  assert.equal(maxAdminsForPlan("PRO"), Infinity);
});

test("maxAdminsForPlan returns the literal cap for limited tiers", () => {
  assert.equal(maxAdminsForPlan("FREE"), 1);
  assert.equal(maxAdminsForPlan("STARTER"), 2);
  assert.equal(maxAdminsForPlan("GROWTH"), 5);
});

test("maxAdminsForPlan treats TRIAL as Pro-equivalent (unlimited)", () => {
  assert.equal(maxAdminsForPlan("TRIAL"), Infinity);
});

test("maxAdminsForPlan returns 0 for LOCKED and null/undefined", () => {
  assert.equal(maxAdminsForPlan("LOCKED"), 0);
  assert.equal(maxAdminsForPlan(null), 0);
  assert.equal(maxAdminsForPlan(undefined), 0);
});

// ---------- maxEmployeesForPlan ----------

test("maxEmployeesForPlan: same shape as maxAdminsForPlan", () => {
  assert.equal(maxEmployeesForPlan("FREE"), 5);
  assert.equal(maxEmployeesForPlan("STARTER"), 15);
  assert.equal(maxEmployeesForPlan("GROWTH"), Infinity);
  assert.equal(maxEmployeesForPlan("PRO"), Infinity);
  assert.equal(maxEmployeesForPlan("TRIAL"), Infinity);
  assert.equal(maxEmployeesForPlan("LOCKED"), 0);
});

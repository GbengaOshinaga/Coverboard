import test from "node:test";
import assert from "node:assert/strict";
import {
  planAtLeast,
  PLAN_DEFAULT_MAX_ADMINS,
  hasPrioritySupport,
  hasSlaSupport,
  hasAuditTrail,
} from "@/lib/plans";

test("planAtLeast respects tier ordering", () => {
  assert.equal(planAtLeast("GROWTH", "STARTER"), true);
  assert.equal(planAtLeast("STARTER", "GROWTH"), false);
});

test("planAtLeast rejects non-paid lifecycle plans", () => {
  assert.equal(planAtLeast("TRIAL", "STARTER"), false);
  assert.equal(planAtLeast("LOCKED", "STARTER"), false);
});

test("support and audit gates unlock at expected tiers", () => {
  assert.equal(hasPrioritySupport("SCALE"), true);
  assert.equal(hasPrioritySupport("GROWTH"), false);
  assert.equal(hasSlaSupport("PRO"), true);
  assert.equal(hasSlaSupport("SCALE"), false);
  assert.equal(hasAuditTrail("PRO"), true);
  assert.equal(hasAuditTrail("GROWTH"), false);
});

test("starter admin cap remains limited while higher tiers are unlimited", () => {
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.STARTER, 2);
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.GROWTH, 0);
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.SCALE, 0);
  assert.equal(PLAN_DEFAULT_MAX_ADMINS.PRO, 0);
});

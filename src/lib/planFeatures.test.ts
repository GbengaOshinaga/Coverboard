import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasFeature,
  hasFeatureForEnum,
  minimumPlanFor,
  PLAN_FEATURES,
} from "./planFeatures";

// ---------- hasFeature: per-plan coverage ----------

test("starter plan gets core features", () => {
  assert.equal(hasFeature("starter", "annual_leave"), true);
  assert.equal(hasFeature("starter", "leave_requests"), true);
  assert.equal(hasFeature("starter", "max_admins_2"), true);
});

test("starter plan does NOT get bradford_factor", () => {
  assert.equal(hasFeature("starter", "bradford_factor"), false);
  assert.equal(hasFeature("starter", "ssp_tracking"), false);
  assert.equal(hasFeature("starter", "api_access"), false);
});

test("growth plan inherits starter features + adds its own", () => {
  for (const f of PLAN_FEATURES.starter) {
    assert.equal(hasFeature("growth", f), true, `growth should have ${f}`);
  }
  assert.equal(hasFeature("growth", "bradford_factor"), true);
  assert.equal(hasFeature("growth", "unlimited_admins"), true);
});

test("growth plan does NOT get scale features", () => {
  assert.equal(hasFeature("growth", "parental_leave_tracker"), false);
  assert.equal(hasFeature("growth", "holiday_pay_calculator"), false);
});

test("scale plan inherits growth + adds its own", () => {
  for (const f of PLAN_FEATURES.growth) {
    assert.equal(hasFeature("scale", f), true);
  }
  assert.equal(hasFeature("scale", "earnings_history"), true);
  assert.equal(hasFeature("scale", "priority_support"), true);
});

test("scale plan does NOT get pro features", () => {
  assert.equal(hasFeature("scale", "api_access"), false);
  assert.equal(hasFeature("scale", "audit_exports"), false);
});

test("pro plan includes everything", () => {
  assert.equal(hasFeature("pro", "annual_leave"), true);
  assert.equal(hasFeature("pro", "bradford_factor"), true);
  assert.equal(hasFeature("pro", "earnings_history"), true);
  assert.equal(hasFeature("pro", "api_access"), true);
  assert.equal(hasFeature("pro", "custom_leave_policies"), true);
});

test("trial plan gets the full Pro feature set", () => {
  for (const f of PLAN_FEATURES.pro) {
    assert.equal(hasFeature("trial", f), true, `trial should have ${f}`);
  }
});

test("locked plan has zero features", () => {
  assert.equal(hasFeature("locked", "annual_leave"), false);
  assert.equal(hasFeature("locked", "bradford_factor"), false);
  assert.equal(hasFeature("locked", "api_access"), false);
});

// ---------- hasFeature: edge cases ----------

test("unknown plan returns false", () => {
  assert.equal(hasFeature("mystery", "annual_leave"), false);
});

test("null/undefined plan returns false", () => {
  assert.equal(hasFeature(null, "annual_leave"), false);
  assert.equal(hasFeature(undefined, "annual_leave"), false);
});

test("unknown feature returns false even on pro", () => {
  assert.equal(hasFeature("pro", "teleportation"), false);
});

// ---------- hasFeatureForEnum: Prisma enum mapping ----------

test("hasFeatureForEnum maps uppercase enum values", () => {
  assert.equal(hasFeatureForEnum("PRO", "api_access"), true);
  assert.equal(hasFeatureForEnum("STARTER", "annual_leave"), true);
  assert.equal(hasFeatureForEnum("STARTER", "api_access"), false);
});

test("hasFeatureForEnum TRIAL behaves like pro (full access)", () => {
  assert.equal(hasFeatureForEnum("TRIAL", "api_access"), true);
  assert.equal(hasFeatureForEnum("TRIAL", "earnings_history"), true);
});

test("hasFeatureForEnum LOCKED has no features", () => {
  assert.equal(hasFeatureForEnum("LOCKED", "annual_leave"), false);
  assert.equal(hasFeatureForEnum("LOCKED", "api_access"), false);
});

// ---------- minimumPlanFor ----------

test("minimumPlanFor returns the lowest tier that includes a feature", () => {
  assert.equal(minimumPlanFor("annual_leave"), "starter");
  assert.equal(minimumPlanFor("bradford_factor"), "growth");
  assert.equal(minimumPlanFor("earnings_history"), "scale");
  assert.equal(minimumPlanFor("api_access"), "pro");
});

test("minimumPlanFor returns null for unknown features", () => {
  assert.equal(minimumPlanFor("teleportation"), null);
});

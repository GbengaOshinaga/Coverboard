import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasFeature,
  hasFeatureForEnum,
  minimumPlanFor,
  PLAN_FEATURES,
} from "./planFeatures";

// ---------- hasFeature: per-plan coverage ----------

test("free plan gets the core leave-tracker features", () => {
  assert.equal(hasFeature("free", "annual_leave"), true);
  assert.equal(hasFeature("free", "team_calendar"), true);
  assert.equal(hasFeature("free", "leave_requests"), true);
  assert.equal(hasFeature("free", "email_notifications"), true);
});

test("free plan does NOT get pro-rata, carry-over or bank-holiday config", () => {
  assert.equal(hasFeature("free", "pro_rata"), false);
  assert.equal(hasFeature("free", "carry_over_rules"), false);
  assert.equal(hasFeature("free", "bank_holiday_config"), false);
});

test("starter plan inherits free features + adds its own", () => {
  for (const f of PLAN_FEATURES.free) {
    assert.equal(hasFeature("starter", f), true, `starter should have ${f}`);
  }
  assert.equal(hasFeature("starter", "pro_rata"), true);
  assert.equal(hasFeature("starter", "carry_over_rules"), true);
  assert.equal(hasFeature("starter", "bank_holiday_config"), true);
});

test("starter plan does NOT get UK statutory features", () => {
  assert.equal(hasFeature("starter", "ssp_tracking"), false);
  assert.equal(hasFeature("starter", "bradford_factor"), false);
  assert.equal(hasFeature("starter", "right_to_work"), false);
  assert.equal(hasFeature("starter", "parental_leave_tracker"), false);
});

test("growth plan inherits starter + UK statutory + holiday-pay calc", () => {
  for (const f of PLAN_FEATURES.starter) {
    assert.equal(hasFeature("growth", f), true, `growth should have ${f}`);
  }
  assert.equal(hasFeature("growth", "ssp_tracking"), true);
  assert.equal(hasFeature("growth", "bradford_factor"), true);
  assert.equal(hasFeature("growth", "right_to_work"), true);
  assert.equal(hasFeature("growth", "parental_leave_tracker"), true);
  assert.equal(hasFeature("growth", "holiday_pay_calculator"), true);
  assert.equal(hasFeature("growth", "earnings_history"), true);
});

test("growth plan does NOT get analytics/reports tier", () => {
  assert.equal(hasFeature("growth", "absence_analytics"), false);
  assert.equal(hasFeature("growth", "compliance_reports"), false);
  assert.equal(hasFeature("growth", "priority_support"), false);
});

test("scale plan adds workforce-analytics tier on top of growth", () => {
  for (const f of PLAN_FEATURES.growth) {
    assert.equal(hasFeature("scale", f), true);
  }
  assert.equal(hasFeature("scale", "absence_analytics"), true);
  assert.equal(hasFeature("scale", "compliance_reports"), true);
  assert.equal(hasFeature("scale", "priority_support"), true);
});

test("scale plan does NOT get pro-only features", () => {
  assert.equal(hasFeature("scale", "api_access"), false);
  assert.equal(hasFeature("scale", "audit_exports"), false);
  assert.equal(hasFeature("scale", "custom_leave_policies"), false);
});

test("pro plan includes everything", () => {
  assert.equal(hasFeature("pro", "annual_leave"), true);
  assert.equal(hasFeature("pro", "bradford_factor"), true);
  assert.equal(hasFeature("pro", "earnings_history"), true);
  assert.equal(hasFeature("pro", "compliance_reports"), true);
  assert.equal(hasFeature("pro", "api_access"), true);
  assert.equal(hasFeature("pro", "custom_leave_policies"), true);
  assert.equal(hasFeature("pro", "audit_exports"), true);
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
  assert.equal(hasFeatureForEnum("FREE", "annual_leave"), true);
  assert.equal(hasFeatureForEnum("FREE", "pro_rata"), false);
  assert.equal(hasFeatureForEnum("STARTER", "pro_rata"), true);
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
  assert.equal(minimumPlanFor("annual_leave"), "free");
  assert.equal(minimumPlanFor("pro_rata"), "starter");
  assert.equal(minimumPlanFor("bradford_factor"), "growth");
  assert.equal(minimumPlanFor("compliance_reports"), "scale");
  assert.equal(minimumPlanFor("api_access"), "pro");
});

test("minimumPlanFor returns null for unknown features", () => {
  assert.equal(minimumPlanFor("teleportation"), null);
});

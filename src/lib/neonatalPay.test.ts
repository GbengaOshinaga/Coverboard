import test from "node:test";
import assert from "node:assert/strict";
import {
  NEONATAL_MAX_WEEKS,
  isNeonatalCareLeaveType,
  calculateNeonatalWeeklyRate,
  calculateNeonatalCarePay,
} from "@/lib/neonatalPay";

const FLAT = 194.32; // 2026/27 statutory weekly rate

// ─── leave-type detection ─────────────────────────────────────────────

test("isNeonatalCareLeaveType matches the neonatal leave type", () => {
  assert.equal(isNeonatalCareLeaveType("Neonatal Care Leave"), true);
  assert.equal(isNeonatalCareLeaveType("Annual Leave"), false);
  assert.equal(isNeonatalCareLeaveType(null), false);
});

// ─── weekly rate = lower of flat or 90% AWE ───────────────────────────

test("weekly rate is 90% of AWE for low earners", () => {
  // 0.9 × 150 = 135 < 194.32 → £135
  assert.equal(calculateNeonatalWeeklyRate(150, FLAT), 135);
});

test("weekly rate is capped at the flat rate for high earners", () => {
  // 0.9 × 300 = 270 > 194.32 → flat
  assert.equal(calculateNeonatalWeeklyRate(300, FLAT), FLAT);
});

test("weekly rate is 0 with no earnings", () => {
  assert.equal(calculateNeonatalWeeklyRate(null, FLAT), 0);
  assert.equal(calculateNeonatalWeeklyRate(0, FLAT), 0);
});

// ─── full pay calc + eligibility + 12-week cap ────────────────────────

test("eligible earner: total = weekly rate × weeks", () => {
  const r = calculateNeonatalCarePay({
    averageWeeklyEarnings: 300,
    weeks: 4,
    flatRate: FLAT,
    lelWeekly: 129,
  });
  assert.equal(r.eligible, true);
  if (r.eligible) {
    assert.equal(r.weeklyRate, FLAT);
    assert.equal(r.weeksPayable, 4);
    assert.equal(r.total, Number((FLAT * 4).toFixed(2)));
  }
});

test("weeks are capped at the 12-week statutory maximum", () => {
  const r = calculateNeonatalCarePay({
    averageWeeklyEarnings: 300,
    weeks: 20,
    flatRate: FLAT,
    lelWeekly: 129,
  });
  assert.equal(r.eligible, true);
  if (r.eligible) {
    assert.equal(r.weeksPayable, NEONATAL_MAX_WEEKS);
  }
});

test("below the Lower Earnings Limit is not eligible", () => {
  const r = calculateNeonatalCarePay({
    averageWeeklyEarnings: 100, // below £129 LEL
    weeks: 4,
    flatRate: FLAT,
    lelWeekly: 129,
  });
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.equal(r.reason, "Below Lower Earnings Limit");
});

test("missing AWE is not eligible", () => {
  const r = calculateNeonatalCarePay({
    averageWeeklyEarnings: null,
    weeks: 4,
    flatRate: FLAT,
    lelWeekly: 129,
  });
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.equal(r.reason, "Missing average weekly earnings");
});

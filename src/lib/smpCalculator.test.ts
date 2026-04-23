import test from "node:test";
import assert from "node:assert/strict";
import {
  SMP_FLAT_RATE,
  calculateAWE,
  calculateSMPPhaseDates,
  calculateSMPPhaseRates,
  getCurrentSMPPhase,
  isMaternityLeaveType,
} from "@/lib/smpCalculator";

// ─── AWE calculation ───────────────────────────────────────────────────

test("AWE averages 8 weeks of earnings (divided by 8)", () => {
  const awe = calculateAWE([
    500, 500, 500, 500, 500, 500, 500, 500,
  ]);
  assert.equal(awe, 500);
});

test("AWE handles mixed earnings with decimals", () => {
  const awe = calculateAWE([
    520.5, 480, 600, 550.25, 500, 475, 610.75, 495,
  ]);
  // Total = 4231.5 → /8 = 528.9375 → 528.94
  assert.equal(awe, 528.94);
});

test("AWE returns 0 when no earnings are supplied", () => {
  assert.equal(calculateAWE([]), 0);
});

test("AWE uses only the most recent 8 weeks when more are supplied", () => {
  const olderWeeks = Array(10).fill(100);
  const recentWeeks = [500, 500, 500, 500, 500, 500, 500, 500];
  const awe = calculateAWE([...olderWeeks, ...recentWeeks]);
  assert.equal(awe, 500);
});

test("AWE includes a zero-earning week in the /8 divisor (no auto-exclusion)", () => {
  // The spec divides by 8 regardless — callers are responsible for
  // filtering zero-pay weeks before passing earnings in.
  const awe = calculateAWE([500, 500, 500, 500, 500, 500, 500, 0]);
  // Total = 3500 → /8 = 437.5
  assert.equal(awe, 437.5);
});

// ─── Phase rates ───────────────────────────────────────────────────────

test("Phase 1 is always 90% of AWE", () => {
  const { phase1Weekly } = calculateSMPPhaseRates(500);
  assert.equal(phase1Weekly, 450);
});

test("Phase 2 uses 90% AWE when that is LOWER than the flat rate (low earner)", () => {
  // 90% of £200 = £180 < flat £194.32 → phase 2 is £180
  const { phase1Weekly, phase2Weekly } = calculateSMPPhaseRates(200);
  assert.equal(phase1Weekly, 180);
  assert.equal(phase2Weekly, 180);
});

test("Phase 2 uses the flat rate when that is LOWER than 90% AWE (higher earner)", () => {
  // 90% of £500 = £450 > flat £194.32 → phase 2 capped at £194.32
  const { phase1Weekly, phase2Weekly } = calculateSMPPhaseRates(500);
  assert.equal(phase1Weekly, 450);
  assert.equal(phase2Weekly, 194.32);
});

test("Phase 2 equals flat rate when 90% AWE exactly matches it", () => {
  const awe = SMP_FLAT_RATE / 0.9; // ~215.91 for 2026/27 default flat rate
  const { phase2Weekly } = calculateSMPPhaseRates(awe);
  // Rounding of toFixed(2) can drift ±0.01 — accept both.
  assert.ok(Math.abs(phase2Weekly - SMP_FLAT_RATE) <= 0.01);
});

test("calculateSMPPhaseRates accepts an explicit flat rate override", () => {
  const { phase2Weekly } = calculateSMPPhaseRates(500, 200);
  // 90% AWE = 450; override flat = 200 → min = 200
  assert.equal(phase2Weekly, 200);
});

test("Both phases are 0 when AWE is 0", () => {
  const { phase1Weekly, phase2Weekly } = calculateSMPPhaseRates(0);
  assert.equal(phase1Weekly, 0);
  assert.equal(phase2Weekly, 0);
});

// ─── Phase dates ───────────────────────────────────────────────────────

test("Phase dates: +6 weeks and +39 weeks from start", () => {
  const start = new Date("2026-06-01T00:00:00.000Z");
  const { phase1EndDate, phase2EndDate } = calculateSMPPhaseDates(start);
  // +6 weeks = 42 days → 2026-07-13
  assert.equal(phase1EndDate.toISOString().slice(0, 10), "2026-07-13");
  // +39 weeks = 273 days → 2027-03-01
  assert.equal(phase2EndDate.toISOString().slice(0, 10), "2027-03-01");
});

test("calculateSMPPhaseDates does not mutate the input date", () => {
  const start = new Date("2026-06-01T00:00:00.000Z");
  const snapshot = start.getTime();
  calculateSMPPhaseDates(start);
  assert.equal(start.getTime(), snapshot);
});

// ─── Current phase ─────────────────────────────────────────────────────

test("getCurrentSMPPhase returns phase_1 in the first 6 weeks", () => {
  const start = new Date("2026-06-01T00:00:00.000Z");
  const result = getCurrentSMPPhase({
    startDate: start,
    phase1Weekly: 450,
    phase2Weekly: 194.32,
    referenceDate: new Date("2026-06-15T00:00:00.000Z"),
  });
  assert.equal(result.phase, "phase_1");
  assert.equal(result.label, "Phase 1 (90% AWE)");
  assert.equal(result.weeklyRate, 450);
});

test("getCurrentSMPPhase returns phase_2 between weeks 7 and 39", () => {
  const start = new Date("2026-06-01T00:00:00.000Z");
  const result = getCurrentSMPPhase({
    startDate: start,
    phase1Weekly: 450,
    phase2Weekly: 194.32,
    referenceDate: new Date("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(result.phase, "phase_2");
  assert.equal(result.label, "Phase 2 (flat rate)");
  assert.equal(result.weeklyRate, 194.32);
});

test("getCurrentSMPPhase returns ended after week 39", () => {
  const start = new Date("2026-06-01T00:00:00.000Z");
  const result = getCurrentSMPPhase({
    startDate: start,
    phase1Weekly: 450,
    phase2Weekly: 194.32,
    referenceDate: new Date("2027-06-01T00:00:00.000Z"),
  });
  assert.equal(result.phase, "ended");
  assert.equal(result.weeklyRate, null);
});

test("getCurrentSMPPhase returns not_started before the start date", () => {
  const start = new Date("2026-06-01T00:00:00.000Z");
  const result = getCurrentSMPPhase({
    startDate: start,
    phase1Weekly: 450,
    phase2Weekly: 194.32,
    referenceDate: new Date("2026-05-01T00:00:00.000Z"),
  });
  assert.equal(result.phase, "not_started");
  assert.equal(result.weeklyRate, null);
});

// ─── Leave-type matcher ────────────────────────────────────────────────

test("isMaternityLeaveType matches common variants", () => {
  assert.equal(isMaternityLeaveType("Statutory Maternity Leave"), true);
  assert.equal(isMaternityLeaveType("maternity"), true);
  assert.equal(isMaternityLeaveType("Adoption Leave"), false);
  assert.equal(isMaternityLeaveType("Statutory Paternity Leave"), false);
  assert.equal(isMaternityLeaveType(null), false);
  assert.equal(isMaternityLeaveType(undefined), false);
});

// ─── Default flat rate sanity ──────────────────────────────────────────

test("SMP_FLAT_RATE default is 194.32 (2026/27)", () => {
  if (!process.env.SMP_FLAT_RATE && !process.env.SMP_WEEKLY_RATE) {
    assert.equal(SMP_FLAT_RATE, 194.32);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrialState } from "./trial";

const NOW = new Date("2026-04-23T12:00:00Z");

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

test("null trialEndsAt returns null", () => {
  assert.equal(computeTrialState(null, NOW), null);
  assert.equal(computeTrialState(undefined, NOW), null);
});

test("14 days out → info tone, 14 days left", () => {
  const s = computeTrialState(addDays(NOW, 14), NOW)!;
  assert.equal(s.daysLeft, 14);
  assert.equal(s.tone, "info");
});

test("4 days out → still info", () => {
  const s = computeTrialState(addDays(NOW, 4), NOW)!;
  assert.equal(s.daysLeft, 4);
  assert.equal(s.tone, "info");
});

test("3 days out → warn", () => {
  const s = computeTrialState(addDays(NOW, 3), NOW)!;
  assert.equal(s.daysLeft, 3);
  assert.equal(s.tone, "warn");
});

test("2 days out → warn", () => {
  const s = computeTrialState(addDays(NOW, 2), NOW)!;
  assert.equal(s.daysLeft, 2);
  assert.equal(s.tone, "warn");
});

test("less than 24 hours remaining → danger with 1 day left", () => {
  const s = computeTrialState(addDays(NOW, 0.5), NOW)!;
  assert.equal(s.daysLeft, 1);
  assert.equal(s.tone, "danger");
});

test("expires exactly now → ended with 0 days", () => {
  const s = computeTrialState(NOW, NOW)!;
  assert.equal(s.daysLeft, 0);
  assert.equal(s.tone, "ended");
});

test("expired 2 days ago → ended with 0 days (floor clamp)", () => {
  const s = computeTrialState(addDays(NOW, -2), NOW)!;
  assert.equal(s.daysLeft, 0);
  assert.equal(s.tone, "ended");
});

test("endsAt is returned verbatim so the UI can format it", () => {
  const end = addDays(NOW, 5);
  const s = computeTrialState(end, NOW)!;
  assert.equal(s.endsAt.getTime(), end.getTime());
});

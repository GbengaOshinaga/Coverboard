import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePasswordStrength,
  MIN_PASSWORD_SCORE,
} from "./password-strength";

test("rejects the literal 'password'", () => {
  const r = evaluatePasswordStrength("password");
  assert.equal(r.ok, false);
  assert.ok(r.score < MIN_PASSWORD_SCORE);
});

test("rejects 'qwerty12345' as a keyboard walk", () => {
  const r = evaluatePasswordStrength("qwerty12345");
  assert.equal(r.ok, false);
});

test("rejects 'letmein!'", () => {
  const r = evaluatePasswordStrength("letmein!");
  assert.equal(r.ok, false);
});

test("rejects a plain numeric sequence", () => {
  const r = evaluatePasswordStrength("12345678");
  assert.equal(r.ok, false);
});

test("user-input context catches password equal to the user's email", () => {
  const r = evaluatePasswordStrength("alice@acme.com", [
    "alice@acme.com",
    "Alice Smith",
    "Acme Inc",
  ]);
  assert.equal(r.ok, false);
});

test("user-input context never RAISES the score relative to no context", () => {
  // Property we depend on: passing user-inputs is a tightening, not a
  // loosening. A future zxcvbn upgrade that violated this would be a
  // security regression.
  const candidate = "AliceSmith2024";
  const withoutContext = evaluatePasswordStrength(candidate);
  const withContext = evaluatePasswordStrength(candidate, [
    "alice.smith@example.com",
    "Alice Smith",
  ]);
  assert.ok(
    withContext.score <= withoutContext.score,
    `context must not raise the score (without=${withoutContext.score}, with=${withContext.score})`
  );
});

test("accepts a reasonably strong passphrase", () => {
  const r = evaluatePasswordStrength("treetop dawn river 84");
  assert.equal(r.ok, true);
  assert.ok(r.score >= MIN_PASSWORD_SCORE);
});

test("accepts a random-looking string of mixed classes", () => {
  const r = evaluatePasswordStrength("7Hk!pQ2vR9mZx");
  assert.equal(r.ok, true);
});

test("returns a human-readable message on rejection", () => {
  const r = evaluatePasswordStrength("password");
  assert.equal(r.ok, false);
  assert.ok(typeof r.message === "string");
  assert.ok(r.message.length > 0);
});

test("returns an empty message on acceptance", () => {
  const r = evaluatePasswordStrength("treetop dawn river 84");
  assert.equal(r.message, "");
});

test("MIN_PASSWORD_SCORE is the documented launch threshold", () => {
  // Memory point: this exact value is documented in
  // project_launch_readiness_v2 — bumping it requires updating that note
  // and the Privacy Policy if security claims change.
  assert.equal(MIN_PASSWORD_SCORE, 2);
});

test("user-input context handles a non-email string without an @ sign", () => {
  // Regression guard: the splitting code shouldn't crash when there's no
  // '@'. The user's NAME goes in unsplit, like "Alice Smith".
  const r = evaluatePasswordStrength("Alice Smith 1", ["Alice Smith"]);
  // Whether ok or not, the call must complete without throwing.
  assert.ok(typeof r.ok === "boolean");
});

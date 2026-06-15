import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mintUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./email-unsubscribe";

const SECRET = "test-secret-for-unsubscribe-tokens";
const NOW = new Date("2026-06-02T12:00:00Z");

test("a minted token round-trips through verify with the same payload", () => {
  const token = mintUnsubscribeToken(
    { userId: "u_1", kind: "weekly_digest", now: NOW },
    SECRET
  );
  const result = verifyUnsubscribeToken(token, SECRET, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.uid, "u_1");
    assert.equal(result.payload.k, "weekly_digest");
    assert.ok(result.payload.exp > NOW.getTime());
  }
});

test("an unrelated secret fails the signature check", () => {
  const token = mintUnsubscribeToken(
    { userId: "u_1", kind: "weekly_digest", now: NOW },
    SECRET
  );
  const result = verifyUnsubscribeToken(token, "different-secret", NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "bad_signature");
});

test("a tampered payload fails the signature check", () => {
  const token = mintUnsubscribeToken(
    { userId: "u_1", kind: "weekly_digest", now: NOW },
    SECRET
  );
  // Swap the encoded payload for one we know doesn't match the sig.
  const parts = token.split(".");
  parts[1] = "ZQ"; // arbitrary other base64url string
  const tampered = parts.join(".");
  const result = verifyUnsubscribeToken(tampered, SECRET, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "bad_signature");
});

test("a malformed token (missing parts) is rejected", () => {
  assert.equal(verifyUnsubscribeToken("", SECRET, NOW).ok, false);
  assert.equal(verifyUnsubscribeToken("only-one-segment", SECRET, NOW).ok, false);
  assert.equal(verifyUnsubscribeToken("v1.payload", SECRET, NOW).ok, false);
});

test("an unknown version prefix is rejected (forward compatibility)", () => {
  const token = mintUnsubscribeToken(
    { userId: "u_1", kind: "weekly_digest", now: NOW },
    SECRET
  );
  // Bump the version segment to something we don't recognise.
  const futureVersion = "v2." + token.split(".").slice(1).join(".");
  const result = verifyUnsubscribeToken(futureVersion, SECRET, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "unknown_version");
});

test("a token past its expiry returns 'expired' (not 'bad_signature')", () => {
  const issued = mintUnsubscribeToken(
    { userId: "u_1", kind: "weekly_digest", now: NOW, ttlMs: 1000 },
    SECRET
  );
  const future = new Date(NOW.getTime() + 5000);
  const result = verifyUnsubscribeToken(issued, SECRET, future);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "expired");
});

test("default TTL is around a year (long-lived because users click old emails)", () => {
  const token = mintUnsubscribeToken(
    { userId: "u_1", kind: "weekly_digest", now: NOW },
    SECRET
  );
  const result = verifyUnsubscribeToken(token, SECRET, NOW);
  if (!result.ok) {
    assert.fail("token should verify");
  }
  const ttlDays = (result.payload.exp - NOW.getTime()) / (24 * 60 * 60 * 1000);
  assert.ok(ttlDays > 360 && ttlDays < 370, `expected ~365 days, got ${ttlDays}`);
});

test("mintUnsubscribeToken refuses to sign without a secret", () => {
  assert.throws(
    () =>
      mintUnsubscribeToken(
        { userId: "u_1", kind: "weekly_digest", now: NOW },
        ""
      ),
    /signing secret/
  );
});

test("constant-time-compare branch: two valid tokens for the same user differ but both verify", () => {
  // Sanity check that two mintings with the same inputs at different times
  // produce different tokens (because expiry differs by ms), and that both
  // still verify cleanly.
  const t1 = mintUnsubscribeToken(
    { userId: "u_1", kind: "weekly_digest", now: NOW },
    SECRET
  );
  const t2 = mintUnsubscribeToken(
    {
      userId: "u_1",
      kind: "weekly_digest",
      now: new Date(NOW.getTime() + 1),
    },
    SECRET
  );
  assert.notEqual(t1, t2);
  assert.equal(verifyUnsubscribeToken(t1, SECRET, NOW).ok, true);
  assert.equal(verifyUnsubscribeToken(t2, SECRET, NOW).ok, true);
});

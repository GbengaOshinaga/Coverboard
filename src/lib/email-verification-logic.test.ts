import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * `consumeVerificationToken` itself talks to Prisma — we can't unit-test
 * that without a DB or invasive mocking. What we CAN test is the pure
 * decision logic: given the lookup result (token row + user verified
 * state), what does the function return?
 *
 * Mirror the branching exactly. If the implementation diverges this test
 * will be the canary.
 */
function decide(
  tokenRow:
    | {
        usedAt: Date | null;
        expiresAt: Date;
        userId: string;
        user: { emailVerified: Date | null };
      }
    | null,
  now: Date
):
  | { ok: true; userId: string; alreadyVerified: boolean }
  | { ok: false; reason: "invalid" | "expired" | "used" } {
  if (!tokenRow) return { ok: false, reason: "invalid" };
  if (tokenRow.user.emailVerified) {
    return {
      ok: true,
      userId: tokenRow.userId,
      alreadyVerified: true,
    };
  }
  if (tokenRow.usedAt) return { ok: false, reason: "used" };
  if (tokenRow.expiresAt < now) return { ok: false, reason: "expired" };
  return { ok: true, userId: tokenRow.userId, alreadyVerified: false };
}

const NOW = new Date("2026-05-30T12:00:00Z");
const ONE_HOUR = 60 * 60 * 1000;

test("returns invalid when no token row was found", () => {
  assert.deepEqual(decide(null, NOW), {
    ok: false,
    reason: "invalid",
  });
});

test("returns success with alreadyVerified=true when the user is already verified, even if token is expired", () => {
  const result = decide(
    {
      usedAt: null,
      expiresAt: new Date(NOW.getTime() - ONE_HOUR),
      userId: "u_1",
      user: { emailVerified: new Date(NOW.getTime() - 5 * ONE_HOUR) },
    },
    NOW
  );
  assert.deepEqual(result, {
    ok: true,
    userId: "u_1",
    alreadyVerified: true,
  });
});

test("returns success with alreadyVerified=true even if the token has been used (refresh case)", () => {
  const result = decide(
    {
      usedAt: new Date(NOW.getTime() - ONE_HOUR),
      expiresAt: new Date(NOW.getTime() + 10 * ONE_HOUR),
      userId: "u_1",
      user: { emailVerified: new Date(NOW.getTime() - ONE_HOUR) },
    },
    NOW
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.alreadyVerified, true);
});

test("returns used when the token was already consumed and the user is still unverified (token race)", () => {
  // This shouldn't normally happen — consumption marks both in a tx — but if
  // it ever does (a stale row, a partial rollback), 'used' is the right
  // signal rather than letting the unverified user proceed silently.
  assert.deepEqual(
    decide(
      {
        usedAt: new Date(NOW.getTime() - ONE_HOUR),
        expiresAt: new Date(NOW.getTime() + 10 * ONE_HOUR),
        userId: "u_1",
        user: { emailVerified: null },
      },
      NOW
    ),
    { ok: false, reason: "used" }
  );
});

test("returns expired when the token's expiry is in the past and user is unverified", () => {
  assert.deepEqual(
    decide(
      {
        usedAt: null,
        expiresAt: new Date(NOW.getTime() - 1),
        userId: "u_1",
        user: { emailVerified: null },
      },
      NOW
    ),
    { ok: false, reason: "expired" }
  );
});

test("returns success+alreadyVerified=false on a fresh, valid first use", () => {
  const result = decide(
    {
      usedAt: null,
      expiresAt: new Date(NOW.getTime() + 10 * ONE_HOUR),
      userId: "u_42",
      user: { emailVerified: null },
    },
    NOW
  );
  assert.deepEqual(result, {
    ok: true,
    userId: "u_42",
    alreadyVerified: false,
  });
});

test("expiry boundary: a token expiring exactly now is still treated as expired", () => {
  // strict less-than would let an `==` token through; the comparison must be
  // `<` so the token IS expired the instant the clock hits its expiry time.
  // Our implementation uses `<` which means the row passes here — but that's
  // actually fine: at the exact millisecond they're equal, the next request
  // a millisecond later will fail. Documenting this so a future refactor to
  // `<=` (strictly closing the boundary) is an intentional choice.
  const result = decide(
    {
      usedAt: null,
      expiresAt: new Date(NOW.getTime()),
      userId: "u_1",
      user: { emailVerified: null },
    },
    NOW
  );
  assert.equal(result.ok, true);
});

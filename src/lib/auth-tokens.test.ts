import test from "node:test";
import assert from "node:assert/strict";
import { hashToken, newLinkToken } from "./auth-tokens";

test("the stored value is the token's hash, never the token", () => {
  const { token, tokenHash } = newLinkToken();
  assert.equal(token.length, 64);
  assert.notEqual(tokenHash, token);
  assert.equal(hashToken(token), tokenHash);
  assert.notEqual(newLinkToken().token, token);
});

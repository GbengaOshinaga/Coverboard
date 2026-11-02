import test from "node:test";
import assert from "node:assert/strict";
import { emailField, normalizeEmail } from "./email-address";

test("addresses are trimmed and lower-cased", () => {
  assert.equal(normalizeEmail("  Jo.Smith@Care.CO.uk "), "jo.smith@care.co.uk");
  assert.equal(emailField().parse(" CEO@Real-Company.com"), "ceo@real-company.com");
  assert.equal(emailField().safeParse("not an email").success, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { signupAlertRecipients } from "./signup-alerts";
import { signupAlertEmail } from "./email-templates";

test("defaults to the founder reply-to, then hello@", () => {
  assert.deepEqual(signupAlertRecipients({}), ["hello@coverboard.io"]);
  assert.deepEqual(signupAlertRecipients({ FOUNDER_REPLY_TO: "me@x.com" }), ["me@x.com"]);
});

test("SIGNUP_ALERT_TO wins and takes a comma list", () => {
  assert.deepEqual(
    signupAlertRecipients({ SIGNUP_ALERT_TO: "a@x.com, b@x.com", FOUNDER_REPLY_TO: "me@x.com" }),
    ["a@x.com", "b@x.com"]
  );
});

test("off disables; preview deploys stay quiet unless set", () => {
  assert.deepEqual(signupAlertRecipients({ SIGNUP_ALERT_TO: "OFF" }), []);
  assert.deepEqual(signupAlertRecipients({ VERCEL_ENV: "preview" }), []);
  assert.deepEqual(signupAlertRecipients({ VERCEL_ENV: "preview", SIGNUP_ALERT_TO: "a@x.com" }), ["a@x.com"]);
  assert.deepEqual(signupAlertRecipients({ VERCEL_ENV: "production" }), ["hello@coverboard.io"]);
});

test("signup alert escapes what the signup typed", () => {
  const { subject, html } = signupAlertEmail({
    orgName: "<b>Acme</b>",
    adminName: "Ann",
    adminEmail: "ann@acme.test",
    plan: "growth",
    billingCountry: "GB",
    method: "signup",
    at: new Date("2026-10-03T12:00:00Z"),
  });
  assert.equal(subject, "New signup: <b>Acme</b>");
  assert.ok(html.includes("&lt;b&gt;Acme&lt;/b&gt;"));
  assert.ok(!html.includes("<b>Acme</b>"));
});

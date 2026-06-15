import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getClientIp,
  getClientIpFromAuthorizeReq,
} from "./rate-limit";

/**
 * The limiter itself talks to Upstash; we can't unit-test it without a live
 * Redis or a mocked SDK module. The IP-extraction helpers are pure and the
 * source of the most subtle bugs (multi-value forwarding chains, missing
 * headers, NextAuth's different shape from Fetch Headers) — those are
 * covered here.
 */

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/test", { headers });
}

test("getClientIp returns the first IP from a multi-value x-forwarded-for chain", () => {
  assert.equal(
    getClientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })),
    "203.0.113.7"
  );
});

test("getClientIp trims whitespace from the extracted address", () => {
  assert.equal(
    getClientIp(req({ "x-forwarded-for": "  203.0.113.7  " })),
    "203.0.113.7"
  );
});

test("getClientIp falls back to x-real-ip when x-forwarded-for is absent", () => {
  assert.equal(getClientIp(req({ "x-real-ip": "203.0.113.8" })), "203.0.113.8");
});

test("getClientIp falls back to 'unknown' when no IP headers exist (prevents shared rate-limit bucket)", () => {
  // Critical: returning "" here would make every header-stripped request
  // share one bucket — trivially DoS-able.
  assert.equal(getClientIp(req({})), "unknown");
});

test("getClientIp returns 'unknown' on an empty x-forwarded-for value", () => {
  assert.equal(getClientIp(req({ "x-forwarded-for": "" })), "unknown");
});

test("getClientIp prefers x-forwarded-for over x-real-ip when both are set", () => {
  assert.equal(
    getClientIp(
      req({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "10.0.0.1" })
    ),
    "203.0.113.7"
  );
});

// --- NextAuth-shaped header object ---

test("getClientIpFromAuthorizeReq handles undefined headers (no req at all)", () => {
  assert.equal(getClientIpFromAuthorizeReq(undefined), "unknown");
});

test("getClientIpFromAuthorizeReq reads a string x-forwarded-for", () => {
  assert.equal(
    getClientIpFromAuthorizeReq({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
    }),
    "203.0.113.9"
  );
});

test("getClientIpFromAuthorizeReq handles array-shaped header values (Node parses multi-headers as arrays)", () => {
  assert.equal(
    getClientIpFromAuthorizeReq({
      "x-forwarded-for": ["203.0.113.10, 10.0.0.1", "ignored"],
    }),
    "203.0.113.10"
  );
});

test("getClientIpFromAuthorizeReq falls back to x-real-ip", () => {
  assert.equal(
    getClientIpFromAuthorizeReq({ "x-real-ip": "203.0.113.11" }),
    "203.0.113.11"
  );
});

test("getClientIpFromAuthorizeReq returns 'unknown' with no relevant headers", () => {
  assert.equal(getClientIpFromAuthorizeReq({}), "unknown");
});

import test from "node:test";
import assert from "node:assert/strict";
import { formatGBP } from "./money";

test("pounds with thousands separators and pence", () => {
  assert.equal(formatGBP(1800), "£1,800.00");
  assert.equal(formatGBP(194.32), "£194.32");
  assert.equal(formatGBP(12345.6), "£12,345.60");
  assert.equal(formatGBP(0), "£0.00");
});

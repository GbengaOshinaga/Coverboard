import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAnalyticsProperties } from "./sanitize";

test("sanitizeAnalyticsProperties removes PII keys", () => {
  const result = sanitizeAnalyticsProperties({
    organization_id: "org_1",
    email: "secret@example.com",
    name: "Jane",
    plan: "TRIAL",
    note: "sick",
  });
  assert.deepEqual(result, {
    organization_id: "org_1",
    plan: "TRIAL",
  });
});

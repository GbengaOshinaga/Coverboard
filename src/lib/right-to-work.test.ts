import test from "node:test";
import assert from "node:assert/strict";
import { rightToWorkAtRisk, rightToWorkLabel, rightToWorkStatus } from "./right-to-work";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const today = d("2026-10-05");

test("status: not checked, failed, expired, recheck due, checked", () => {
  assert.equal(rightToWorkStatus({ verified: null, expiresOn: null }, today), "not_checked");
  assert.equal(rightToWorkStatus({ verified: false, expiresOn: null }, today), "not_verified");
  assert.equal(rightToWorkStatus({ verified: true, expiresOn: d("2026-10-04") }, today), "expired");
  // Ends today: still valid today, recheck due.
  assert.equal(rightToWorkStatus({ verified: true, expiresOn: d("2026-10-05") }, today), "recheck_due");
  assert.equal(rightToWorkStatus({ verified: true, expiresOn: d("2026-12-04") }, today), "recheck_due"); // 60 days
  assert.equal(rightToWorkStatus({ verified: true, expiresOn: d("2026-12-05") }, today), "checked"); // 61 days
  assert.equal(rightToWorkStatus({ verified: true, expiresOn: null }, today), "checked");
});

test("at risk means no valid right to work on record; a recheck coming up isn't a breach yet", () => {
  assert.equal(rightToWorkAtRisk("not_checked"), true);
  assert.equal(rightToWorkAtRisk("not_verified"), true);
  assert.equal(rightToWorkAtRisk("expired"), true);
  assert.equal(rightToWorkAtRisk("recheck_due"), false);
  assert.equal(rightToWorkAtRisk("checked"), false);
});

test("labels say what to do", () => {
  assert.equal(rightToWorkLabel("recheck_due", { expiresOn: d("2026-11-20"), checkedOn: d("2026-09-01") }), "Recheck before 20 Nov 2026");
  assert.equal(rightToWorkLabel("expired", { expiresOn: d("2026-10-04"), checkedOn: null }), "Permission expired 4 Oct 2026: recheck now");
  assert.equal(rightToWorkLabel("checked", { expiresOn: null, checkedOn: d("2026-09-01") }), "Checked 1 Sept 2026, no time limit");
});

import test from "node:test";
import assert from "node:assert/strict";
import { AWAY_LEAVE_TYPE, leaveTypeSeenBy } from "./leave-privacy";

test("staff see colleagues as Away; managers, admins and the person themselves see the type", () => {
  const sick = { name: "Statutory Sick Pay (SSP)", color: "#ef4444" };
  assert.deepEqual(leaveTypeSeenBy(sick, { id: "hana", role: "MEMBER" }, "amy"), AWAY_LEAVE_TYPE);
  assert.equal(leaveTypeSeenBy(sick, { id: "amy", role: "MEMBER" }, "amy"), sick);
  assert.equal(leaveTypeSeenBy(sick, { id: "wanjiku", role: "MANAGER" }, "amy"), sick);
  assert.equal(leaveTypeSeenBy(sick, { id: "ade", role: "ADMIN" }, "amy"), sick);
});

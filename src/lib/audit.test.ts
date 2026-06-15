import { test } from "node:test";
import assert from "node:assert/strict";
import { selectSicknessAuditMeta } from "./audit";

function leave(
  id: string,
  userId: string,
  sicknessNote: string | null = null
) {
  return { id, userId, sicknessNote };
}

test("returns null when viewer is a MEMBER (own data is not a sensitive read)", () => {
  const result = selectSicknessAuditMeta(
    [leave("l1", "u_member", "Hurt my back")],
    "u_member",
    "MEMBER"
  );
  assert.equal(result, null);
});

test("returns null when no leave in the result set carries a sickness note", () => {
  const result = selectSicknessAuditMeta(
    [leave("l1", "u_member", null), leave("l2", "u_other", "")],
    "u_admin",
    "ADMIN"
  );
  assert.equal(result, null);
});

test("excludes the viewer's own sickness note from the exposed set", () => {
  const result = selectSicknessAuditMeta(
    [
      leave("l_self", "u_admin", "My own sickness"),
      leave("l_other", "u_other", "Other employee's sickness"),
    ],
    "u_admin",
    "ADMIN"
  );
  assert.deepEqual(result, {
    leaveRequestIds: ["l_other"],
    count: 1,
  });
});

test("returns null when the only sickness-bearing record is the viewer's own", () => {
  const result = selectSicknessAuditMeta(
    [leave("l_self", "u_admin", "My own sickness")],
    "u_admin",
    "ADMIN"
  );
  assert.equal(result, null);
});

test("MANAGER role also triggers the audit when viewing another user's sickness", () => {
  const result = selectSicknessAuditMeta(
    [leave("l1", "u_other", "Sick note")],
    "u_manager",
    "MANAGER"
  );
  assert.ok(result);
  assert.equal(result!.count, 1);
});

test("aggregates multiple exposed leaves into a single audit metadata payload", () => {
  const result = selectSicknessAuditMeta(
    [
      leave("l1", "u_a", "Flu"),
      leave("l2", "u_b", "Migraine"),
      leave("l3", "u_c", null),
      leave("l4", "u_d", "Surgery recovery"),
    ],
    "u_admin",
    "ADMIN"
  );
  assert.deepEqual(result, {
    leaveRequestIds: ["l1", "l2", "l4"],
    count: 3,
  });
});

test("treats empty-string sicknessNote as not exposed", () => {
  const result = selectSicknessAuditMeta(
    [leave("l1", "u_other", "")],
    "u_admin",
    "ADMIN"
  );
  assert.equal(result, null);
});

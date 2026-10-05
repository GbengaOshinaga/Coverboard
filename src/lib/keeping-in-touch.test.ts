import test from "node:test";
import assert from "node:assert/strict";
import { keepingInTouchError, keepingInTouchRule } from "./keeping-in-touch";

test("KIT on maternity and adoption, SPLIT on shared parental, none on paternity", () => {
  assert.deepEqual(keepingInTouchRule("Statutory Maternity Leave"), { kind: "KIT", field: "kitDaysUsed", allowed: 10 });
  assert.deepEqual(keepingInTouchRule("Adoption Leave"), { kind: "KIT", field: "kitDaysUsed", allowed: 10 });
  assert.deepEqual(keepingInTouchRule("Shared Parental Leave (SPL)"), { kind: "SPLIT", field: "splitDaysUsed", allowed: 20 });
  assert.equal(keepingInTouchRule("Statutory Paternity Leave"), null);
  assert.equal(keepingInTouchRule("Annual Leave"), null);
});

test("keepingInTouchError enforces the limit and the right kind of day", () => {
  assert.equal(keepingInTouchError("Statutory Maternity Leave", { kitDaysUsed: 10 }), null);
  assert.match(keepingInTouchError("Statutory Maternity Leave", { kitDaysUsed: 11 })!, /Up to 10 KIT days/);
  assert.match(keepingInTouchError("Statutory Maternity Leave", { splitDaysUsed: 2 })!, /uses KIT days, not SPLIT/);
  assert.equal(keepingInTouchError("Shared Parental Leave (SPL)", { splitDaysUsed: 20 }), null);
  assert.match(keepingInTouchError("Shared Parental Leave (SPL)", { splitDaysUsed: 21 })!, /Up to 20 SPLIT days/);
  assert.match(keepingInTouchError("Shared Parental Leave (SPL)", { kitDaysUsed: 3 })!, /uses SPLIT days, not KIT/);
  assert.match(keepingInTouchError("Statutory Paternity Leave", { kitDaysUsed: 1 })!, /has no KIT or SPLIT days/);
  // Zero is always fine (the default on every booking).
  assert.equal(keepingInTouchError("Statutory Paternity Leave", { kitDaysUsed: 0, splitDaysUsed: 0 }), null);
});

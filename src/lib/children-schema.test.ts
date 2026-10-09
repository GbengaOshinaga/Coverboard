import test from "node:test";
import assert from "node:assert/strict";
import { canConfirmChildDetails, childChangeError, duplicateChildError } from "./children-schema";

const child = { dateOfBirth: "2024-03-01", placedOn: null, disabilityBenefit: false, weeksTakenElsewhere: 2 };
const booked = [{ startDate: "2026-06-01", endDate: "2026-06-05" }];

test("staff can't give themselves more unpaid parental leave", () => {
  const staff = { canApprove: false, before: child, bookings: booked };
  assert.match(childChangeError({ ...staff, after: { ...child, disabilityBenefit: true } })!, /admin or manager/);
  assert.match(childChangeError({ ...staff, after: { ...child, weeksTakenElsewhere: 0 } })!, /admin or manager/);
  assert.match(childChangeError({ ...staff, after: { ...child, dateOfBirth: "2024-02-01" } })!, /admin or manager/);
  assert.match(
    childChangeError({ canApprove: false, before: null, after: { ...child, disabilityBenefit: true }, bookings: [] })!,
    /admin or manager/
  );
  // Fixing a label, or a date before anything is booked, is fine.
  assert.equal(childChangeError({ ...staff, after: { ...child } }), null);
  assert.equal(childChangeError({ ...staff, bookings: [], after: { ...child, dateOfBirth: "2024-02-01" } }), null);
});

test("an admin or manager can, but not so booked leave falls outside the child's dates", () => {
  const admin = { canApprove: true, before: child, bookings: booked };
  assert.equal(childChangeError({ ...admin, after: { ...child, disabilityBenefit: true, weeksTakenElsewhere: 0 } }), null);
  assert.match(childChangeError({ ...admin, after: { ...child, dateOfBirth: "2026-07-01" } })!, /before that date of birth/);
  assert.match(childChangeError({ ...admin, after: { ...child, placedOn: "2026-06-03" } })!, /before that placement/);
  assert.match(childChangeError({ ...admin, after: { ...child, dateOfBirth: "2008-06-04" } })!, /18th birthday/);
});

test("the same child can't be added twice; twins need different names", () => {
  const ada = { label: "Ada", dateOfBirth: "2024-03-01", placedOn: null };
  assert.match(duplicateChildError({ ...ada }, [ada])!, /already a child/);
  assert.match(duplicateChildError({ ...ada, label: " ada " }, [ada])!, /already a child/);
  assert.match(duplicateChildError({ ...ada, label: null }, [ada])!, /twins/);
  assert.equal(duplicateChildError({ ...ada, label: "Bo" }, [ada]), null);
  assert.equal(duplicateChildError({ ...ada, dateOfBirth: "2025-01-01" }, [ada]), null);
});

test("managers can't confirm details for their own child; admins can", () => {
  assert.equal(canConfirmChildDetails({ id: "m", role: "MANAGER" }, "m"), false);
  assert.equal(canConfirmChildDetails({ id: "m", role: "MANAGER" }, "x"), true);
  assert.equal(canConfirmChildDetails({ id: "a", role: "ADMIN" }, "a"), true);
  assert.equal(canConfirmChildDetails({ id: "s", role: "MEMBER" }, "s"), false);
});

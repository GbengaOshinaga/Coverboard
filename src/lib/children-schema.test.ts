import test from "node:test";
import assert from "node:assert/strict";
import { childChangeError } from "./children-schema";

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

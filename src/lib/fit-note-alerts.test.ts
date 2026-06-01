import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectOverdueFitNotes,
  isSicknessLeaveType,
  type SicknessLeaveRow,
} from "./fit-note-alerts";

const NOW = new Date("2026-05-31T12:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * MS_PER_DAY);
}
function daysAhead(n: number): Date {
  return new Date(NOW.getTime() + n * MS_PER_DAY);
}

function leave(
  overrides: Partial<SicknessLeaveRow> = {}
): SicknessLeaveRow {
  return {
    id: "lr_1",
    startDate: daysAgo(10),
    endDate: daysAhead(5),
    status: "APPROVED",
    evidenceProvided: false,
    user: { id: "u_1", name: "Alice", email: "alice@example.com" },
    leaveType: { name: "Statutory Sick Pay (SSP)" },
    ...overrides,
  };
}

// ---------- isSicknessLeaveType ----------

test("recognises SSP leave types", () => {
  assert.equal(isSicknessLeaveType("Statutory Sick Pay (SSP)"), true);
  assert.equal(isSicknessLeaveType("SSP"), true);
});

test("recognises Sick leave naming variants", () => {
  assert.equal(isSicknessLeaveType("Sick leave"), true);
  assert.equal(isSicknessLeaveType("Sickness Absence"), true);
});

test("does not match unrelated leave types", () => {
  assert.equal(isSicknessLeaveType("Annual Leave"), false);
  assert.equal(isSicknessLeaveType("Maternity Leave"), false);
  assert.equal(isSicknessLeaveType("Compassionate"), false);
});

// ---------- selectOverdueFitNotes: positive cases ----------

test("flags an active SSP leave at day 8 with no evidence", () => {
  const out = selectOverdueFitNotes([leave({ startDate: daysAgo(8) })], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.daysElapsed, 8);
});

test("includes leaves that ended in the last 7 days (recently-ended grace window)", () => {
  const out = selectOverdueFitNotes(
    [
      leave({
        startDate: daysAgo(15),
        endDate: daysAgo(3), // ended 3 days ago
      }),
    ],
    NOW
  );
  assert.equal(out.length, 1);
});

// ---------- selectOverdueFitNotes: filter rules ----------

test("ignores leaves where evidence was provided", () => {
  const out = selectOverdueFitNotes(
    [leave({ evidenceProvided: true })],
    NOW
  );
  assert.equal(out.length, 0);
});

test("ignores PENDING and REJECTED leaves (admin owes nothing yet)", () => {
  const pending = selectOverdueFitNotes(
    [leave({ status: "PENDING" })],
    NOW
  );
  const rejected = selectOverdueFitNotes(
    [leave({ status: "REJECTED" })],
    NOW
  );
  assert.equal(pending.length, 0);
  assert.equal(rejected.length, 0);
});

test("ignores non-sickness leave types even if long-running with no evidence", () => {
  const annual = selectOverdueFitNotes(
    [
      leave({
        leaveType: { name: "Annual Leave" },
        startDate: daysAgo(20),
      }),
    ],
    NOW
  );
  assert.equal(annual.length, 0);
});

test("ignores leaves under the 7-day fit-note threshold", () => {
  // Day 7 exactly — still within self-certification, no fit note required yet.
  const day7 = selectOverdueFitNotes(
    [leave({ startDate: daysAgo(7) })],
    NOW
  );
  assert.equal(day7.length, 0);
  // Day 3 — clearly not overdue.
  const day3 = selectOverdueFitNotes(
    [leave({ startDate: daysAgo(3) })],
    NOW
  );
  assert.equal(day3.length, 0);
});

test("ignores leaves that ended more than 7 days ago (no longer actionable)", () => {
  const longGone = selectOverdueFitNotes(
    [
      leave({
        startDate: daysAgo(30),
        endDate: daysAgo(20),
      }),
    ],
    NOW
  );
  assert.equal(longGone.length, 0);
});

// ---------- selectOverdueFitNotes: aggregation ----------

test("returns multiple overdue leaves in input order", () => {
  const out = selectOverdueFitNotes(
    [
      leave({
        id: "lr_a",
        startDate: daysAgo(10),
        user: { id: "u_a", name: "Alice", email: "a@x" },
      }),
      leave({
        id: "lr_b",
        startDate: daysAgo(8),
        user: { id: "u_b", name: "Bob", email: "b@x" },
      }),
      // This one is fine — annual leave is not sickness.
      leave({
        id: "lr_c",
        leaveType: { name: "Annual Leave" },
        startDate: daysAgo(20),
        user: { id: "u_c", name: "Carol", email: "c@x" },
      }),
    ],
    NOW
  );
  assert.equal(out.length, 2);
  assert.equal(out[0]!.userName, "Alice");
  assert.equal(out[1]!.userName, "Bob");
});

// ---------- selectOverdueFitNotes: payload shape ----------

test("output carries the leave + user fields needed to render the email", () => {
  const out = selectOverdueFitNotes(
    [
      leave({
        id: "lr_99",
        startDate: daysAgo(10),
        endDate: daysAhead(3),
        leaveType: { name: "Statutory Sick Pay (SSP)" },
        user: {
          id: "u_99",
          name: "Casey",
          email: "casey@example.com",
        },
      }),
    ],
    NOW
  );
  assert.equal(out.length, 1);
  const first = out[0]!;
  assert.equal(first.leaveId, "lr_99");
  assert.equal(first.userId, "u_99");
  assert.equal(first.userName, "Casey");
  assert.equal(first.userEmail, "casey@example.com");
  assert.equal(first.leaveTypeName, "Statutory Sick Pay (SSP)");
  assert.equal(first.daysElapsed, 10);
});

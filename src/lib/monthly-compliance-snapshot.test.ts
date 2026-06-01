import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildComplianceSnapshot,
  DEFAULT_BRADFORD_THRESHOLD,
  type SnapshotInputs,
} from "./monthly-compliance-snapshot";

const NOW = new Date("2026-06-01T09:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function daysAhead(n: number): Date {
  return new Date(NOW.getTime() + n * MS_PER_DAY);
}
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * MS_PER_DAY);
}

function inputs(overrides: Partial<SnapshotInputs> = {}): SnapshotInputs {
  return {
    activeUkEmployees: 0,
    leavesThisMonth: [],
    bradfordScores: [],
    parentalLeavesActive: [],
    rightToWorkUnverified: [],
    ...overrides,
  };
}

// ---------- workforce + leaves split ----------

test("splits leavesThisMonth into sickness and other by leave-type name", () => {
  const out = buildComplianceSnapshot(
    inputs({
      activeUkEmployees: 12,
      leavesThisMonth: [
        { leaveTypeName: "Annual Leave" },
        { leaveTypeName: "Statutory Sick Pay (SSP)" },
        { leaveTypeName: "Sick leave" },
        { leaveTypeName: "Compassionate" },
      ],
    }),
    { now: NOW }
  );
  assert.equal(out.activeUkEmployees, 12);
  assert.equal(out.leavesThisMonth.total, 4);
  assert.equal(out.leavesThisMonth.sickness, 2);
  assert.equal(out.leavesThisMonth.other, 2);
});

// ---------- Bradford alerts ----------

test("Bradford alerts include only scores at or above the threshold", () => {
  const out = buildComplianceSnapshot(
    inputs({
      bradfordScores: [
        { userId: "u1", name: "Alice", score: 199 },
        { userId: "u2", name: "Bob", score: 200 },
        { userId: "u3", name: "Carol", score: 320 },
      ],
    }),
    { now: NOW, bradfordThreshold: 200 }
  );
  assert.equal(out.bradfordAlerts.length, 2);
  // Sorted desc by score
  assert.equal(out.bradfordAlerts[0]!.name, "Carol");
  assert.equal(out.bradfordAlerts[1]!.name, "Bob");
});

test("Bradford alerts honour the default threshold of 200 when not supplied", () => {
  assert.equal(DEFAULT_BRADFORD_THRESHOLD, 200);
  const out = buildComplianceSnapshot(
    inputs({
      bradfordScores: [{ userId: "u1", name: "Alice", score: 250 }],
    }),
    { now: NOW }
  );
  assert.equal(out.bradfordAlerts.length, 1);
});

test("Bradford alerts cap at the top 10 to keep the email readable", () => {
  const fifteen = Array.from({ length: 15 }, (_, i) => ({
    userId: `u${i}`,
    name: `Person ${i}`,
    score: 250 + i,
  }));
  const out = buildComplianceSnapshot(inputs({ bradfordScores: fifteen }), {
    now: NOW,
  });
  assert.equal(out.bradfordAlerts.length, 10);
  // Top by score, descending
  assert.equal(out.bradfordAlerts[0]!.score, 264);
});

// ---------- parental ----------

test("parentalActive counts every active leave; returningSoon filters to next 30 days", () => {
  const out = buildComplianceSnapshot(
    inputs({
      parentalLeavesActive: [
        {
          userId: "u1",
          name: "Alice",
          leaveTypeName: "Statutory Maternity Leave",
          endDate: daysAhead(15),
        },
        {
          userId: "u2",
          name: "Bob",
          leaveTypeName: "Statutory Paternity Leave",
          endDate: daysAhead(45),
        },
        {
          userId: "u3",
          name: "Carol",
          leaveTypeName: "Shared Parental Leave (SPL)",
          endDate: daysAhead(7),
        },
      ],
    }),
    { now: NOW }
  );
  assert.equal(out.parentalActive, 3);
  assert.equal(out.parentalReturningSoon.length, 2);
  // Sorted by end date ascending
  assert.equal(out.parentalReturningSoon[0]!.name, "Carol");
  assert.equal(out.parentalReturningSoon[1]!.name, "Alice");
});

test("parentalReturningSoon excludes past end dates (defensive — DB query should already filter)", () => {
  const out = buildComplianceSnapshot(
    inputs({
      parentalLeavesActive: [
        {
          userId: "u1",
          name: "Alice",
          leaveTypeName: "Maternity",
          endDate: daysAgo(2),
        },
      ],
    }),
    { now: NOW }
  );
  assert.equal(out.parentalActive, 1);
  assert.equal(out.parentalReturningSoon.length, 0);
});

// ---------- right to work ----------

test("rightToWorkUnverified count is full; sample caps at 5 names", () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({
    userId: `u${i}`,
    name: `Person ${i}`,
  }));
  const out = buildComplianceSnapshot(
    inputs({ rightToWorkUnverified: eight }),
    { now: NOW }
  );
  assert.equal(out.rightToWorkUnverifiedCount, 8);
  assert.equal(out.rightToWorkUnverifiedSample.length, 5);
});

// ---------- all-clear flag ----------

test("isAllClear is true only when every signal is quiet", () => {
  const allClear = buildComplianceSnapshot(
    inputs({ activeUkEmployees: 12 }),
    { now: NOW }
  );
  assert.equal(allClear.isAllClear, true);

  const oneAlert = buildComplianceSnapshot(
    inputs({
      activeUkEmployees: 12,
      bradfordScores: [{ userId: "u1", name: "Alice", score: 250 }],
    }),
    { now: NOW }
  );
  assert.equal(oneAlert.isAllClear, false);

  const oneLeave = buildComplianceSnapshot(
    inputs({
      activeUkEmployees: 12,
      leavesThisMonth: [{ leaveTypeName: "Annual Leave" }],
    }),
    { now: NOW }
  );
  assert.equal(oneLeave.isAllClear, false);
});

test("zero employees with no flags is still all-clear (new/empty org case)", () => {
  const out = buildComplianceSnapshot(inputs(), { now: NOW });
  assert.equal(out.isAllClear, true);
  assert.equal(out.activeUkEmployees, 0);
});

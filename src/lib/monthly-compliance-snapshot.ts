/**
 * Monthly compliance snapshot — Scale tier feature.
 *
 * Produces the small, skim-able summary used by the monthly compliance
 * email. The shape is deliberately narrower than the full
 * `/api/reports/uk-compliance` payload — recipients should read this in
 * 30 seconds and click through to the dashboard if anything looks off.
 *
 * The aggregation is split from the DB queries so it can be unit-tested
 * without a database. The cron route does the queries and hands the raw
 * shape to `buildComplianceSnapshot`.
 */

export const DEFAULT_BRADFORD_THRESHOLD = 200;
const UNVERIFIED_SAMPLE_LIMIT = 5;

export type SnapshotInputs = {
  /** Count of active UK employees as of `now`. */
  activeUkEmployees: number;
  /** Leaves that started OR ended within the snapshot month. */
  leavesThisMonth: ReadonlyArray<{ leaveTypeName: string }>;
  /** All UK active users with their current Bradford score. */
  bradfordScores: ReadonlyArray<{
    userId: string;
    name: string;
    score: number;
  }>;
  /** Active maternity/paternity/SPL leaves with expected return dates. */
  parentalLeavesActive: ReadonlyArray<{
    userId: string;
    name: string;
    leaveTypeName: string;
    endDate: Date;
  }>;
  /** UK active employees whose right-to-work is not yet verified. */
  rightToWorkUnverified: ReadonlyArray<{ userId: string; name: string }>;
};

export type ComplianceSnapshot = {
  activeUkEmployees: number;
  leavesThisMonth: {
    total: number;
    sickness: number;
    other: number;
  };
  bradfordAlerts: Array<{ userId: string; name: string; score: number }>;
  parentalActive: number;
  parentalReturningSoon: Array<{
    userId: string;
    name: string;
    leaveTypeName: string;
    endDate: Date;
  }>;
  rightToWorkUnverifiedCount: number;
  rightToWorkUnverifiedSample: Array<{ userId: string; name: string }>;
  /** True when every signal is clean — used to suppress noise emails. */
  isAllClear: boolean;
};

function isSicknessName(name: string): boolean {
  return /SSP|Sick/i.test(name);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildComplianceSnapshot(
  inputs: SnapshotInputs,
  options: { bradfordThreshold?: number; now?: Date } = {}
): ComplianceSnapshot {
  const threshold = options.bradfordThreshold ?? DEFAULT_BRADFORD_THRESHOLD;
  const now = options.now ?? new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * MS_PER_DAY);

  const sickness = inputs.leavesThisMonth.filter((l) =>
    isSicknessName(l.leaveTypeName)
  ).length;
  const total = inputs.leavesThisMonth.length;

  const bradfordAlerts = inputs.bradfordScores
    .filter((b) => b.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const parentalReturningSoon = inputs.parentalLeavesActive
    .filter((p) => p.endDate >= now && p.endDate <= thirtyDaysFromNow)
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

  const rightToWorkUnverifiedSample = inputs.rightToWorkUnverified.slice(
    0,
    UNVERIFIED_SAMPLE_LIMIT
  );

  const isAllClear =
    total === 0 &&
    bradfordAlerts.length === 0 &&
    inputs.parentalLeavesActive.length === 0 &&
    inputs.rightToWorkUnverified.length === 0;

  return {
    activeUkEmployees: inputs.activeUkEmployees,
    leavesThisMonth: {
      total,
      sickness,
      other: total - sickness,
    },
    bradfordAlerts,
    parentalActive: inputs.parentalLeavesActive.length,
    parentalReturningSoon,
    rightToWorkUnverifiedCount: inputs.rightToWorkUnverified.length,
    rightToWorkUnverifiedSample,
    isAllClear,
  };
}

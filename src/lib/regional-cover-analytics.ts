/**
 * Regional cover analytics — Scale tier feature.
 *
 * Per-leave-request cover clashes have always been visible on submission
 * (Coverboard warns when granting a request drops a region below its
 * `minCover`). What this helper adds is the AGGREGATE story: across the
 * last 13 weeks, on how many days was each region under-cover, and which
 * week was worst?
 *
 * Pure function — the route does the DB pulls, hands `regions` + `leaves`
 * here, and reads the aggregate shape back. Uses the CURRENT region
 * assignment per user (not historical) — accuracy can drift slightly if
 * there's been very recent movement, but UserRegionHistory replay isn't
 * worth the complexity for a weekly-grained signal.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RegionForAnalytics = {
  id: string;
  name: string;
  minCover: number;
  memberIds: ReadonlyArray<string>;
};

export type LeaveForAnalytics = {
  userId: string;
  /** Inclusive */
  startDate: Date;
  /** Inclusive */
  endDate: Date;
};

export type WeekStat = {
  /** UTC midnight Monday of the week. */
  weekStart: Date;
  weekKey: string;
  /** Days that week the region was below `minCover` (0–7). */
  daysBelowCover: number;
  /** Lowest staffing observed any day that week (after absences). */
  minCoverageObserved: number;
};

export type RegionCoverReport = {
  regionId: string;
  name: string;
  minCover: number;
  memberCount: number;
  totalDaysBelowCover: number;
  /** Lowest staffing observed any day in the whole period. */
  minCoverageObserved: number;
  /** Always exactly `weeksBack` weeks, oldest first. */
  weeklySeries: WeekStat[];
};

function startOfWeekUtc(d: Date): Date {
  // ISO week: Monday is day 1. JS Sunday=0, so convert to a Monday-relative
  // offset and subtract.
  const day = d.getUTCDay();
  const fromMonday = (day + 6) % 7;
  const monday = new Date(d.getTime() - fromMonday * MS_PER_DAY);
  return new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate()
    )
  );
}

function weekKey(monday: Date): string {
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function utcMidnight(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

/**
 * Compute regional cover stats across the trailing window.
 *
 * Regions with zero members are dropped from the output — a region with
 * no people doesn't have a meaningful coverage number, and showing
 * "every day below cover" for an empty placeholder region would be
 * confusing.
 */
export function computeRegionalCover(
  regions: ReadonlyArray<RegionForAnalytics>,
  leaves: ReadonlyArray<LeaveForAnalytics>,
  options: { now?: Date; weeksBack?: number } = {}
): RegionCoverReport[] {
  const now = options.now ?? new Date();
  const weeksBack = options.weeksBack ?? 13;

  const currentWeekStart = startOfWeekUtc(utcMidnight(now));
  const weekStarts: Date[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    weekStarts.push(
      new Date(currentWeekStart.getTime() - i * 7 * MS_PER_DAY)
    );
  }
  const periodStart = weekStarts[0]!;
  // The period covers `weeksBack * 7` days starting at the first Monday;
  // last day is the Sunday seven days after the most recent Monday.
  const periodEnd = new Date(
    currentWeekStart.getTime() + 7 * MS_PER_DAY - 1
  );

  // Pre-filter leaves to those overlapping the period — cheaper than
  // checking inside the per-day loop.
  const relevantLeaves = leaves.filter(
    (l) => l.endDate >= periodStart && l.startDate <= periodEnd
  );

  const out: RegionCoverReport[] = [];

  for (const region of regions) {
    if (region.memberIds.length === 0) continue;

    const memberSet = new Set(region.memberIds);
    const regionLeaves = relevantLeaves.filter((l) => memberSet.has(l.userId));

    let totalDaysBelow = 0;
    let minCoverageOverall = region.memberIds.length;
    const weeklySeries: WeekStat[] = [];

    for (const weekStart of weekStarts) {
      let daysBelow = 0;
      let minCoverageWeek = region.memberIds.length;

      for (let d = 0; d < 7; d++) {
        const dayStart = new Date(weekStart.getTime() + d * MS_PER_DAY);
        // Skip days outside the overall period (shouldn't happen but be
        // defensive at the edges).
        if (dayStart > periodEnd) continue;

        const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY - 1);
        // Count distinct users on leave that day (a user with two
        // overlapping leaves still counts once).
        const usersOff = new Set<string>();
        for (const leave of regionLeaves) {
          if (leave.endDate < dayStart) continue;
          if (leave.startDate > dayEnd) continue;
          usersOff.add(leave.userId);
        }
        const coverage = region.memberIds.length - usersOff.size;
        if (coverage < minCoverageWeek) minCoverageWeek = coverage;
        if (coverage < region.minCover) daysBelow++;
      }

      totalDaysBelow += daysBelow;
      if (minCoverageWeek < minCoverageOverall) {
        minCoverageOverall = minCoverageWeek;
      }
      weeklySeries.push({
        weekStart,
        weekKey: weekKey(weekStart),
        daysBelowCover: daysBelow,
        minCoverageObserved: minCoverageWeek,
      });
    }

    out.push({
      regionId: region.id,
      name: region.name,
      minCover: region.minCover,
      memberCount: region.memberIds.length,
      totalDaysBelowCover: totalDaysBelow,
      minCoverageObserved: minCoverageOverall,
      weeklySeries,
    });
  }

  // Most problematic regions first.
  return out.sort(
    (a, b) => b.totalDaysBelowCover - a.totalDaysBelowCover
  );
}

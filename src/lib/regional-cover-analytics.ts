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

import type { CoverDaySettings } from "./coverDays";
import {
  computeShiftCover,
  type EngineAssignment,
  type EngineLeave,
  type EnginePattern,
  type EngineShift,
} from "./shiftCover";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RegionForAnalytics = CoverDaySettings & {
  id: string;
  name: string;
  minCover: number;
  memberIds: ReadonlyArray<string>;
  /** Shift types and working patterns; omit for per-day cover. */
  shifts?: EngineShift[];
  patterns?: EnginePattern[];
  /** Accepted cover offers: shifts that were covered by someone off-pattern. */
  assignments?: EngineAssignment[];
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
  /**
   * Days that week the region was below `minCover` (0–7). Weekends and bank
   * holidays only count when the region enforces cover on them.
   */
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

function isoDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekKey(monday: Date): string {
  return isoDateUtc(monday);
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
  options: {
    now?: Date;
    weeksBack?: number;
    /** YYYY-MM-DD bank holiday dates in the period. */
    bankHolidayDates?: ReadonlySet<string>;
  } = {}
): RegionCoverReport[] {
  const now = options.now ?? new Date();
  const bankHolidayDates = options.bankHolidayDates ?? new Set<string>();
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
    const leavesByUser = new Map<string, EngineLeave[]>();
    for (const l of relevantLeaves) {
      if (!memberSet.has(l.userId)) continue;
      const list = leavesByUser.get(l.userId) ?? [];
      list.push({
        start: isoDateUtc(l.startDate),
        end: isoDateUtc(l.endDate),
        leaveTypeName: "",
      });
      leavesByUser.set(l.userId, list);
    }

    const days: string[] = [];
    for (let t = periodStart.getTime(); t <= periodEnd.getTime(); t += MS_PER_DAY) {
      days.push(isoDateUtc(new Date(t)));
    }
    const coverByDate = new Map(
      computeShiftCover({
        region,
        shifts: region.shifts ?? [],
        patterns: region.patterns ?? [],
        assignments: region.assignments ?? [],
        members: region.memberIds.map((id) => ({ id, name: "" })),
        leavesByUser,
        bankHolidayDates,
        days,
        includeCoverOptions: false,
      }).map((d) => [d.date, d])
    );

    let totalDaysBelow = 0;
    let minCoverageOverall = region.memberIds.length;
    const weeklySeries: WeekStat[] = [];

    for (const weekStart of weekStarts) {
      let daysBelow = 0;
      let minCoverageWeek = region.memberIds.length;

      for (let d = 0; d < 7; d++) {
        const dayStart = new Date(weekStart.getTime() + d * MS_PER_DAY);
        const day = coverByDate.get(isoDateUtc(dayStart));
        if (!day) continue;

        // Lowest staffing on any running shift (the whole team in per-day
        // mode); a day counts once however many shifts fall short.
        for (const shift of day.shifts) {
          if (shift.available < minCoverageWeek) minCoverageWeek = shift.available;
        }
        if (day.shifts.some((sh) => sh.coverRequired && sh.available < sh.required)) {
          daysBelow++;
        }
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

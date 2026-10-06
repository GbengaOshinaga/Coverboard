import type { ExportColumn } from "@/lib/export-formats";

/**
 * Working Time Regulations, defined once:
 *  - 48 hours a week on average, normally over 17 weeks (reg. 4), unless the
 *    worker has opted out in writing (reg. 5).
 *  - 11 hours' rest in a row between working days (reg. 10).
 * https://www.gov.uk/maximum-weekly-working-hours
 * https://www.legislation.gov.uk/uksi/1998/1833/regulation/4
 *
 * Hours come from what the app knows: hours logged for a week where they're
 * recorded, otherwise the shifts in their working pattern plus cover they
 * accepted, minus approved leave. It doesn't know clock-in times, so this is
 * an estimate to act on, not a timesheet.
 */

export const WEEKLY_HOURS_AVERAGE_LIMIT = 48;
export const REFERENCE_WEEKS = 17;
export const DAILY_REST_HOURS = 11;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** One shift, as UTC instants of the local start and end times. */
export type WorkedShift = { start: number; end: number; source: "pattern" | "cover" };

export type WorkingTimeInput = {
  /** Mondays (YYYY-MM-DD) of the weeks in the reference period, oldest first. */
  weeks: string[];
  shifts: WorkedShift[];
  /** Logged hours by week (Monday YYYY-MM-DD); used instead of shifts that week. */
  loggedHours: Map<string, number>;
  /** Working days of leave or sickness in the period (they don't count as work). */
  leaveDays: number;
  daysPerWeek: number;
  optedOut: boolean;
  /**
   * Employment start (YYYY-MM-DD). Someone employed for less than the
   * reference period is averaged over the weeks since they started (reg. 4(4)),
   * so five 84-hour weeks don't hide inside 17.
   */
  startedOn?: string | null;
};

export type RestGap = {
  /** YYYY-MM-DD the earlier shift ends. */
  date: string;
  gapHours: number;
};

export type WorkingTimeSummary = {
  weeks: Array<{ weekStart: string; hours: number; logged: boolean }>;
  /** Average over the weeks they were available to work (leave weeks left out). */
  averageHours: number;
  highestWeek: number;
  weeksOver48: number;
  restGaps: RestGap[];
  optedOut: boolean;
  /** Over the 48-hour average without an opt-out. */
  overAverageLimit: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const addDays = (isoDay: string, n: number) =>
  new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const mondayOf = (ms: number) => {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
};

export function summariseWorkingTime(input: WorkingTimeInput): WorkingTimeSummary {
  const fromShifts = new Map<string, number>();
  for (const s of input.shifts) {
    const wk = mondayOf(s.start);
    fromShifts.set(wk, (fromShifts.get(wk) ?? 0) + (s.end - s.start) / HOUR_MS);
  }
  // Weeks they were employed for (all of them unless they started part-way).
  const employedWeeks = input.startedOn
    ? input.weeks.filter((w) => addDays(w, 6) >= input.startedOn!)
    : input.weeks;
  const weeks = employedWeeks.map((weekStart) => {
    const logged = input.loggedHours.get(weekStart);
    return logged !== undefined
      ? { weekStart, hours: round1(logged), logged: true }
      : { weekStart, hours: round1(fromShifts.get(weekStart) ?? 0), logged: false };
  });
  const total = weeks.reduce((s, w) => s + w.hours, 0);
  // Leave and sickness aren't work, and shouldn't pull the average down
  // (reg. 4(6) makes up those days after the period; this divides by the
  // weeks they were available instead, which comes to much the same).
  const leaveWeeks = input.daysPerWeek > 0 ? input.leaveDays / input.daysPerWeek : 0;
  const availableWeeks = Math.max(1, weeks.length - leaveWeeks);
  const averageHours = round1(total / availableWeeks);

  const ordered = [...input.shifts].sort((a, b) => a.start - b.start);
  const restGaps: RestGap[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const gap = (ordered[i].start - ordered[i - 1].end) / HOUR_MS;
    // Overlapping shifts (gap < 0) are a booking clash, not a rest break.
    if (gap >= 0 && gap < DAILY_REST_HOURS) {
      restGaps.push({ date: new Date(ordered[i - 1].end).toISOString().slice(0, 10), gapHours: round1(gap) });
    }
  }

  return {
    weeks,
    averageHours,
    highestWeek: Math.max(0, ...weeks.map((w) => w.hours)),
    weeksOver48: weeks.filter((w) => w.hours > WEEKLY_HOURS_AVERAGE_LIMIT).length,
    restGaps,
    optedOut: input.optedOut,
    overAverageLimit: !input.optedOut && averageHours > WEEKLY_HOURS_AVERAGE_LIMIT,
  };
}

/** Is a written opt-out in force on a date? */
export function optOutInForce(
  person: { optOutFrom: Date | null; optOutUntil: Date | null },
  on: Date = new Date()
): boolean {
  if (!person.optOutFrom || person.optOutFrom > on) return false;
  return !person.optOutUntil || person.optOutUntil.getTime() + DAY_MS > on.getTime();
}

/** The 17 Mondays ending with the week before `today`'s week. */
export function referenceWeeks(today: Date, count = REFERENCE_WEEKS): string[] {
  const thisMonday = Date.parse(`${mondayOf(today.getTime())}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(thisMonday - (count - i) * 7 * DAY_MS).toISOString().slice(0, 10)
  );
}

export type WorkingTimeRow = {
  userId: string;
  name: string;
  averageHours: number;
  highestWeek: number;
  weeksOver48: number;
  restGapCount: number;
  /** Most recent gap under 11 hours. */
  latestRestGap: RestGap | null;
  optedOut: boolean;
  overAverageLimit: boolean;
  /** Weeks using logged hours rather than the schedule. */
  loggedWeeks: number;
  /** Weeks averaged over: 17, or fewer for someone who started part-way. */
  weeksCounted: number;
  /** Without an employment start date, a new starter's average is diluted. */
  startDateKnown: boolean;
  /**
   * Where the average starts: their employment start date, the first week
   * with recorded work (no start date), or the whole 17 weeks (no work yet).
   */
  averagedFrom: "start_date" | "first_recorded_work" | "whole_period";
  /** Rostered hours this week and next (pattern + accepted cover − leave). */
  thisWeekHours: number;
  nextWeekHours: number;
  /** Rest under 11 hours coming up this week or next. */
  upcomingRestGaps: RestGap[];
};

export const WORKING_TIME_COLUMNS: ExportColumn<WorkingTimeRow>[] = [
  { key: "userId", header: "Employee ID" },
  { key: "name", header: "Employee" },
  { key: "averageHours", header: "Average weekly hours (17 weeks)" },
  { key: "highestWeek", header: "Highest week (hours)" },
  { key: "weeksOver48", header: "Weeks over 48 hours" },
  { key: (r) => (r.optedOut ? "Yes" : "No"), header: "Opted out of 48-hour limit" },
  { key: (r) => (r.overAverageLimit ? "Yes" : "No"), header: "Over 48-hour average without opt-out" },
  { key: "thisWeekHours", header: "This week, rostered (hours)" },
  { key: "nextWeekHours", header: "Next week, rostered (hours)" },
  { key: (r) => r.upcomingRestGaps.length, header: "Short rest coming up (this week or next)" },
  { key: "restGapCount", header: "Rest gaps under 11 hours" },
  { key: (r) => r.latestRestGap?.date ?? null, header: "Latest short rest (date)" },
  { key: (r) => r.latestRestGap?.gapHours ?? null, header: "Latest short rest (hours)" },
  { key: "weeksCounted", header: "Weeks averaged" },
  { key: "loggedWeeks", header: "Weeks from logged hours" },
  { key: (r) => (r.startDateKnown ? "Yes" : "No"), header: "Start date recorded" },
  {
    key: (r) =>
      r.averagedFrom === "start_date"
        ? "Start date"
        : r.averagedFrom === "first_recorded_work"
          ? "First recorded work"
          : "Whole period",
    header: "Averaged from",
  },
];

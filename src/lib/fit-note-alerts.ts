/**
 * Fit-note alerting — Growth tier feature.
 *
 * UK SSP rules:
 *   - Days 1–7 of a sickness absence: employee self-certifies
 *   - Day 8 onward: a "fit note" (Statement of Fitness for Work) from a GP
 *     is required. Without it, the employer can't continue paying SSP and
 *     loses audit cover.
 *
 * Coverboard records evidence receipt via `LeaveRequest.evidenceProvided`,
 * a single boolean. An "overdue fit note" is therefore: an approved
 * sickness leave that's gone past day 7 and still has no evidence flagged.
 *
 * The helper here is the pure detection logic — given a set of leaves and
 * "now", return the ones that should be flagged. The cron route calls it
 * per organisation and emails the result to admins/managers.
 *
 * Design choices that aren't free:
 *   - Calendar days, not working days. The 7-day fit-note rule is statutory
 *     and counts every day of the week, including weekends.
 *   - Active leaves only by default. A leave that ended weeks ago without
 *     evidence is a historical compliance gap (worth a separate report) but
 *     not an actionable alert — the employer can't retroactively obtain a
 *     fit note for a finished absence. We include leaves that ended in the
 *     last 90 days so admins have a chance to chase recently-returned
 *     employees who still owe a fit note.
 */

const FIT_NOTE_THRESHOLD_DAYS = 7;
/**
 * How long after an absence ends its missing fit note stays on the list.
 * Employers can still get a backdated fit note (and need one to support SSP
 * paid past day 7), so a finished absence is still worth chasing — dropping
 * it after a week hid real gaps (an absence that ended 10 days ago showed 0).
 */
const RECENTLY_ENDED_GRACE_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SicknessLeaveRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  status: string;
  evidenceProvided: boolean;
  user: { id: string; name: string; email: string };
  leaveType: { name: string };
};

export type OverdueFitNote = {
  leaveId: string;
  userId: string;
  userName: string;
  userEmail: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  /** Calendar days elapsed since the leave started (to today). */
  daysElapsed: number;
  /** Days off counting the first day, up to today or the day it ended. */
  daysOff: number;
  /** The absence is over (still listed: the fit note is still owed). */
  ended: boolean;
};

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * One wording for an overdue fit note, used by the dashboard, the leave
 * operations report and the Monday email: "Off since 14 Sept · day 22", or
 * for an absence that's over, "Off 14–25 Sept (12 days) · ended".
 */
export function fitNoteDueLabel(o: Pick<OverdueFitNote, "startDate" | "endDate" | "daysOff" | "ended">): string {
  if (!o.ended) return `Off since ${DAY_MONTH.format(o.startDate)} · day ${o.daysOff}`;
  return `Off ${DAY_MONTH.format(o.startDate)}–${DAY_MONTH.format(o.endDate)} (${o.daysOff} days) · ended`;
}

/** Statutory sickness leaves — SSP, Sick leave variants, etc. */
export function isSicknessLeaveType(name: string): boolean {
  return /SSP|Sick/i.test(name);
}

function calendarDaysBetween(start: Date, end: Date): number {
  // Compare at day-level granularity using UTC midnight so DST and time-of-
  // day differences don't shift the boundary.
  const startMs = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );
  const endMs = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate()
  );
  return Math.floor((endMs - startMs) / MS_PER_DAY);
}

/**
 * Filter a set of leaves down to those that should trigger a fit-note alert.
 *
 * A leave qualifies when:
 *   1. Status is APPROVED (we don't chase fit notes for pending requests).
 *   2. The leave type is a statutory sickness type.
 *   3. `evidenceProvided` is false.
 *   4. The leave started more than 7 calendar days ago.
 *   5. The leave is still active, OR it ended within the last 90 days
 *      (the fit note is still owed, so admins can still chase it).
 */
export function selectOverdueFitNotes(
  leaves: ReadonlyArray<SicknessLeaveRow>,
  now: Date
): OverdueFitNote[] {
  const overdue: OverdueFitNote[] = [];
  for (const leave of leaves) {
    if (leave.status !== "APPROVED") continue;
    if (leave.evidenceProvided) continue;
    if (!isSicknessLeaveType(leave.leaveType.name)) continue;

    const daysSinceStart = calendarDaysBetween(leave.startDate, now);
    if (daysSinceStart <= FIT_NOTE_THRESHOLD_DAYS) continue;

    const daysSinceEnd = calendarDaysBetween(leave.endDate, now);
    const stillActive = leave.endDate >= now;
    const recentlyEnded =
      !stillActive && daysSinceEnd <= RECENTLY_ENDED_GRACE_DAYS;
    if (!stillActive && !recentlyEnded) continue;

    overdue.push({
      leaveId: leave.id,
      userId: leave.user.id,
      userName: leave.user.name,
      userEmail: leave.user.email,
      leaveTypeName: leave.leaveType.name,
      startDate: leave.startDate,
      endDate: leave.endDate,
      daysElapsed: daysSinceStart,
      daysOff: calendarDaysBetween(leave.startDate, stillActive ? now : leave.endDate) + 1,
      ended: !stillActive,
    });
  }
  return overdue;
}

export const FIT_NOTE_ALERT_CONSTANTS = {
  FIT_NOTE_THRESHOLD_DAYS,
  RECENTLY_ENDED_GRACE_DAYS,
};

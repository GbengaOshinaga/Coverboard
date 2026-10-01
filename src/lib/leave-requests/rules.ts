/**
 * Pure rules for leave request creation, kept free of DB access so they can be
 * unit tested. `create.ts` resolves the facts (roles, orgs, leave type) and
 * asks these helpers for the decision.
 */

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Whole calendar days from today to `startDate`, comparing UTC dates only.
 * Dates arrive as UTC midnight (the form sends `new Date("YYYY-MM-DD")`), so
 * comparing against the raw current time made a same-day request come out as
 * -1 and fail even a 0-day notice rule.
 */
export function calendarDaysUntil(startDate: Date, now: Date): number {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate()
  );
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((start - today) / DAY_MS);
}

/** Same name test the SSP, Bradford and review paths already use. */
export function isSicknessLeaveTypeName(name: string): boolean {
  return /SSP|Sick/i.test(name);
}

/**
 * Sickness can't be given notice of, and is often reported after the fact, so
 * notice rules only apply to planned leave.
 */
export function noticeError(
  leaveType: { name: string; minNoticeDays: number },
  startDate: Date,
  now: Date
): string | null {
  if (isSicknessLeaveTypeName(leaveType.name)) return null;
  if (calendarDaysUntil(startDate, now) < leaveType.minNoticeDays) {
    return `This leave type requires at least ${leaveType.minNoticeDays} days notice`;
  }
  return null;
}

export type OnBehalfCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * A manager recording an absence for someone else (the 7am phone call).
 * Limited to sickness: planned leave is the employee's own request to make.
 */
export function checkOnBehalf(input: {
  actorRole: string;
  subjectFound: boolean;
  leaveTypeName: string;
}): OnBehalfCheck {
  if (input.actorRole !== "ADMIN" && input.actorRole !== "MANAGER") {
    return {
      ok: false,
      status: 403,
      error: "Only admins and managers can log absence for a team member.",
    };
  }
  if (!input.subjectFound) {
    return { ok: false, status: 404, error: "Team member not found" };
  }
  if (!isSicknessLeaveTypeName(input.leaveTypeName)) {
    return {
      ok: false,
      status: 400,
      error: "Only sickness can be logged on a team member's behalf.",
    };
  }
  return { ok: true };
}

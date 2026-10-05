import { prisma } from "@/lib/prisma";
import { shiftLengthHours } from "@/lib/cover-shifts";
import { countWorkingDays, resolveWorkingWeek, weekdaysFromPatterns } from "@/lib/working-week";
import {
  optOutInForce,
  referenceWeeks,
  summariseWorkingTime,
  type WorkedShift,
  type WorkingTimeRow,
} from "@/lib/working-time";

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);

/** A shift on a date from "HH:MM" times (overnight shifts end the next day). */
function shiftOn(date: string, startTime: string, endTime: string, source: WorkedShift["source"]): WorkedShift {
  const start = Date.parse(`${date}T${startTime}:00Z`);
  return { start, end: start + shiftLengthHours(startTime, endTime) * 3_600_000, source };
}

/**
 * Working time for each UK member of a team over the last 17 full weeks:
 * their pattern's shifts and accepted cover (minus approved leave), or hours
 * logged for a week. Rules in src/lib/working-time.ts.
 */
export async function workingTimeRows(organizationId: string, today: Date = new Date()): Promise<WorkingTimeRow[]> {
  const weeks = referenceWeeks(today);
  const from = day(weeks[0]);
  const to = new Date(day(weeks[weeks.length - 1]).getTime() + 6 * DAY_MS);
  // Looking ahead too: this week and next, as rostered (like the cover picker).
  const thisMonday = new Date(to.getTime() + DAY_MS);
  const nextMonday = new Date(thisMonday.getTime() + 7 * DAY_MS);
  const aheadTo = new Date(nextMonday.getTime() + 6 * DAY_MS);

  const users = await prisma.user.findMany({
    where: { organizationId, isActive: true, workCountry: "GB" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      daysWorkedPerWeek: true,
      serviceStartDate: true,
      workingTimeOptOutFrom: true,
      workingTimeOptOutUntil: true,
      workPatterns: {
        select: {
          weekday: true,
          effectiveFrom: true,
          effectiveTo: true,
          shiftType: { select: { startTime: true, endTime: true } },
        },
      },
      leaveRequests: {
        where: { status: "APPROVED", startDate: { lte: aheadTo }, endDate: { gte: from } },
        select: { startDate: true, endDate: true },
      },
      weeklyHours: {
        where: { weekStartDate: { gte: from, lte: to } },
        select: { weekStartDate: true, hoursWorked: true },
      },
      // Hours on pay records count as logged too.
      weeklyEarnings: {
        where: { weekStartDate: { gte: from, lte: to }, isZeroPayWeek: false },
        select: { weekStartDate: true, hoursWorked: true },
      },
      coverOffersReceived: {
        where: { status: "ACCEPTED", date: { gte: from, lte: aheadTo } },
        select: { date: true, shiftType: { select: { startTime: true, endTime: true } } },
      },
    },
  });

  return users.map((u) => {
    const onLeave = (date: string) =>
      u.leaveRequests.some((l) => iso(l.startDate) <= date && iso(l.endDate) >= date);
    const shifts: WorkedShift[] = [];
    for (let t = from.getTime(); t <= aheadTo.getTime(); t += DAY_MS) {
      const date = iso(new Date(t));
      if (onLeave(date)) continue;
      const weekday = (new Date(t).getUTCDay() + 6) % 7;
      for (const p of u.workPatterns) {
        if (p.weekday !== weekday) continue;
        if (iso(p.effectiveFrom) > date || (p.effectiveTo && iso(p.effectiveTo) < date)) continue;
        shifts.push(shiftOn(date, p.shiftType.startTime, p.shiftType.endTime, "pattern"));
      }
    }
    for (const c of u.coverOffersReceived) {
      shifts.push(shiftOn(iso(c.date), c.shiftType.startTime, c.shiftType.endTime, "cover"));
    }

    const week = resolveWorkingWeek(weekdaysFromPatterns(u.workPatterns, to), u.daysWorkedPerWeek);
    // The past 17 weeks for the average; this week and next looking ahead.
    const pastShifts = shifts.filter((s) => s.start < thisMonday.getTime());
    const ahead = summariseWorkingTime({
      weeks: [iso(thisMonday), iso(nextMonday)],
      // From the last past shift on, so a short rest across Sunday night counts.
      shifts: shifts.filter((s) => s.end >= thisMonday.getTime() - DAY_MS),
      loggedHours: new Map(),
      leaveDays: 0,
      daysPerWeek: 5,
      optedOut: false,
    });
    const leaveDays = u.leaveRequests.reduce(
      (s, l) =>
        s + countWorkingDays(l.startDate < from ? from : l.startDate, l.endDate > to ? to : l.endDate, week.weekdays),
      0
    );
    // Logged hours: the weekly hours log first, else hours on that week's pay record.
    const loggedHours = new Map<string, number>();
    for (const e of u.weeklyEarnings) {
      if (Number(e.hoursWorked) > 0) loggedHours.set(iso(e.weekStartDate), Number(e.hoursWorked));
    }
    for (const h of u.weeklyHours) loggedHours.set(iso(h.weekStartDate), h.hoursWorked);

    // Employed for less than the 17 weeks: average from their start date, or
    // without one, from the first week with any recorded work (so a new
    // starter's hours aren't spread over weeks before they joined).
    const firstWorked = [...pastShifts.map((s) => iso(new Date(s.start))), ...loggedHours.keys()].sort()[0] ?? null;
    const startedOn = u.serviceStartDate ? iso(u.serviceStartDate) : firstWorked;
    const summary = summariseWorkingTime({
      weeks,
      shifts: pastShifts,
      loggedHours,
      leaveDays,
      daysPerWeek: week.daysPerWeek,
      startedOn,
      optedOut: optOutInForce({ optOutFrom: u.workingTimeOptOutFrom, optOutUntil: u.workingTimeOptOutUntil }, today),
    });
    return {
      userId: u.id,
      name: u.name,
      averageHours: summary.averageHours,
      highestWeek: summary.highestWeek,
      weeksOver48: summary.weeksOver48,
      restGapCount: summary.restGaps.length,
      latestRestGap: summary.restGaps[summary.restGaps.length - 1] ?? null,
      optedOut: summary.optedOut,
      overAverageLimit: summary.overAverageLimit,
      loggedWeeks: summary.weeks.filter((w) => w.logged).length,
      weeksCounted: summary.weeks.length,
      startDateKnown: !!u.serviceStartDate,
      averagedFrom: u.serviceStartDate ? "start_date" : firstWorked ? "first_recorded_work" : "whole_period",
      thisWeekHours: ahead.weeks[0].hours,
      nextWeekHours: ahead.weeks[1].hours,
      upcomingRestGaps: ahead.restGaps,
    };
  });
}

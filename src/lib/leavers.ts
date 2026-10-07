import { prisma } from "@/lib/prisma";
import { dbDate, endWorkPatternOps } from "@/lib/workPattern";
import { recomputeAllSspSpells } from "@/lib/leave-requests/ssp-spell";
import { isSicknessLeaveTypeName } from "@/lib/leave-requests/rules";

/**
 * Someone leaving, defined once. The leaving date is their last day of
 * employment: it can be in the past (recorded late) or the future (working
 * their notice). Past or today, they're marked as left now; in the future
 * they stay on the team until then and the nightly job marks them as left the
 * day after (deactivateLeaversDue).
 *
 * Either way, at once: their working pattern ends after the last day, leave
 * and cover after it are cancelled (they can't be taken), and leave running
 * past it is cut short at the last day.
 */

const DAY_MS = 86_400_000;

/** Furthest ahead a leaving date can be set (a long notice period). */
export const MAX_NOTICE_DAYS = 366;

/** Checks a leaving date (YYYY-MM-DD). Returns an error message or null. */
export function leavingDateError(input: {
  lastDay: string;
  today: string;
  serviceStartDate: Date | null;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lastDay)) return "Pick their last day.";
  const last = dbDate(input.lastDay);
  if (input.serviceStartDate && last < input.serviceStartDate) {
    return "Their last day can't be before they started.";
  }
  if (last.getTime() - dbDate(input.today).getTime() > MAX_NOTICE_DAYS * DAY_MS) {
    return "Their last day can't be more than a year from now.";
  }
  return null;
}

/** Leaving date in the future: they're still on the team until then. */
export function isLeavingLater(lastDay: string, today: string): boolean {
  return lastDay > today;
}

/**
 * Records a leaving date and does everything that follows from it. Returns
 * counts for the audit log.
 */
export async function recordLeaving(input: { userId: string; lastDay: string; today: string }) {
  const lastDay = dbDate(input.lastDay);
  const dayAfter = new Date(lastDay.getTime() + DAY_MS);
  const leftNow = !isLeavingLater(input.lastDay, input.today);

  // Leave running past the last day is cut short at it.
  const spanning = await prisma.leaveRequest.findMany({
    where: {
      userId: input.userId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: lastDay },
      endDate: { gt: lastDay },
    },
    select: { id: true, leaveType: { select: { name: true } } },
  });

  const [, , , cancelledLeave, cancelledCover, trimmedLeave] = await prisma.$transaction([
    prisma.user.update({
      where: { id: input.userId },
      data: { leftOn: lastDay, ...(leftNow ? { isActive: false } : {}) },
    }),
    // Patterns run to the last day; cover after it no longer counts them.
    ...endWorkPatternOps(input.userId, dayAfter),
    prisma.leaveRequest.updateMany({
      where: { userId: input.userId, status: { in: ["PENDING", "APPROVED"] }, startDate: { gt: lastDay } },
      data: { status: "CANCELLED" },
    }),
    prisma.coverOffer.updateMany({
      where: { userId: input.userId, status: { in: ["PENDING", "ACCEPTED"] }, date: { gt: lastDay } },
      data: { status: "WITHDRAWN" },
    }),
    prisma.leaveRequest.updateMany({
      where: { id: { in: spanning.map((r) => r.id) } },
      data: { endDate: lastDay },
    }),
  ]);

  // SSP stops when employment ends: recalculate if sickness was cut short.
  if (spanning.some((r) => isSicknessLeaveTypeName(r.leaveType.name))) {
    await recomputeAllSspSpells(input.userId);
  }

  return {
    leftNow,
    futureLeaveCancelled: cancelledLeave.count,
    futureCoverWithdrawn: cancelledCover.count,
    leaveCutShort: trimmedLeave.count,
  };
}

/**
 * Nightly: people whose leaving date has passed are marked as left (no
 * sign-in, off the team list, approvals and alerts).
 */
export async function deactivateLeaversDue(today: string): Promise<number> {
  const result = await prisma.user.updateMany({
    where: { isActive: true, leftOn: { lt: dbDate(today) } },
    data: { isActive: false },
  });
  return result.count;
}

/** What recordLeaving would do for a last day, without doing it (for the dialog). */
export async function previewLeaving(input: { userId: string; lastDay: string }) {
  const lastDay = dbDate(input.lastDay);
  const live = { userId: input.userId, status: { in: ["PENDING", "APPROVED"] as ("PENDING" | "APPROVED")[] } };
  const [cancelled, cutShort, cover] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { ...live, startDate: { gt: lastDay } },
      orderBy: { startDate: "asc" },
      select: { startDate: true, endDate: true, leaveType: { select: { name: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: { ...live, startDate: { lte: lastDay }, endDate: { gt: lastDay } },
      select: { startDate: true, endDate: true, leaveType: { select: { name: true } } },
    }),
    prisma.coverOffer.count({
      where: { userId: input.userId, status: { in: ["PENDING", "ACCEPTED"] }, date: { gt: lastDay } },
    }),
  ]);
  const row = (r: { startDate: Date; endDate: Date; leaveType: { name: string } }) => ({
    leaveType: r.leaveType.name,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
  });
  return { leaveCancelled: cancelled.map(row), leaveCutShort: cutShort.map(row), coverWithdrawn: cover };
}

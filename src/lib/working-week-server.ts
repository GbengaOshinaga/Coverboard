import { prisma } from "@/lib/prisma";
import { resolveWorkingWeek, weekdaysFromPatterns, type WorkingWeek } from "@/lib/working-week";

/**
 * A person's working week on a date: their working pattern's weekdays when
 * they have one, else their stored days worked per week. The same answer for
 * holiday and SSP — SSP qualifying days are the days they normally work.
 * (`qualifyingDaysPerWeek` is kept in step for display but never read here:
 * nothing in the app set it, so it said 5 for everyone.)
 */
export async function getWorkingWeek(userId: string, onDate: Date = new Date()): Promise<WorkingWeek> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      daysWorkedPerWeek: true,
      workPatterns: { select: { weekday: true, effectiveFrom: true, effectiveTo: true } },
    },
  });
  if (!user) return resolveWorkingWeek(null, null);
  return resolveWorkingWeek(weekdaysFromPatterns(user.workPatterns, onDate), user.daysWorkedPerWeek);
}

/** qualifyingDaysPerWeek is a whole number; keep it in step with days worked. */
export function qualifyingDaysFor(daysWorkedPerWeek: number): number | undefined {
  return daysWorkedPerWeek >= 1 ? Math.min(7, Math.max(1, Math.round(daysWorkedPerWeek))) : undefined;
}

/**
 * After a working pattern changes, keep the stored day counts in step with it
 * so screens and older calculations that read them agree with the pattern.
 * No-op when the pattern is empty (e.g. zero-hours staff).
 */
export async function syncDaysFromPattern(userId: string): Promise<void> {
  const patterns = await prisma.workPattern.findMany({
    where: { userId },
    select: { weekday: true, effectiveFrom: true, effectiveTo: true },
  });
  const weekdays = weekdaysFromPatterns(patterns, new Date());
  if (!weekdays) return;
  await prisma.user.update({
    where: { id: userId },
    data: { daysWorkedPerWeek: weekdays.length, qualifyingDaysPerWeek: weekdays.length },
  });
}

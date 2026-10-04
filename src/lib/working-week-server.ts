import { prisma } from "@/lib/prisma";
import { resolveWorkingWeek, weekdaysFromPatterns, type WorkingWeek } from "@/lib/working-week";

/**
 * A person's working week on a date. `basis` picks the stored fallback when
 * they have no working pattern: "holiday" uses daysWorkedPerWeek, "ssp" uses
 * qualifyingDaysPerWeek (the days SSP is payable on).
 */
export async function getWorkingWeek(
  userId: string,
  onDate: Date = new Date(),
  basis: "holiday" | "ssp" = "holiday"
): Promise<WorkingWeek> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      daysWorkedPerWeek: true,
      qualifyingDaysPerWeek: true,
      workPatterns: { select: { weekday: true, effectiveFrom: true, effectiveTo: true } },
    },
  });
  if (!user) return resolveWorkingWeek(null, null);
  return resolveWorkingWeek(
    weekdaysFromPatterns(user.workPatterns, onDate),
    basis === "ssp" ? Number(user.qualifyingDaysPerWeek) : user.daysWorkedPerWeek
  );
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

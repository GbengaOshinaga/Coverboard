import { calculateSspPayableDays } from "@/lib/uk-compliance";

const DAY_MS = 86_400_000;

/**
 * SSP days paid within a pay period [from, to] for one absence.
 *
 * The absence's stored SSP days are the source of truth (they already reflect
 * the 28-week cap and linked absences); this splits them across periods in
 * date order: days paid by the end of the period, minus days paid before it.
 * Pre-6 April 2026 absences linked to an earlier one had no waiting days; the
 * split assumes the usual waiting days, so it can place one to three days in
 * a later period — the absence's total never changes.
 */
export function sspDaysInPeriod(input: {
  startDate: Date;
  endDate: Date;
  /** SSP days stored on the absence. */
  sspDaysPaid: number;
  /** Their qualifying weekdays (Monday-first), or null for Mon–Fri. */
  weekdays: number[] | null;
  from: Date;
  to: Date;
}): number {
  const { startDate, endDate, sspDaysPaid, weekdays } = input;
  const paidBy = (day: Date): number => {
    if (day < startDate) return 0;
    const until = day < endDate ? day : endDate;
    return Math.min(sspDaysPaid, calculateSspPayableDays(startDate, until, weekdays));
  };
  const periodStart = input.from > startDate ? input.from : startDate;
  const periodEnd = input.to < endDate ? input.to : endDate;
  if (periodEnd < periodStart) return 0;
  return paidBy(periodEnd) - paidBy(new Date(periodStart.getTime() - DAY_MS));
}

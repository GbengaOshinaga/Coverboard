import { calculateBradfordFactor } from "@/lib/uk-compliance";
import { countWeekdays } from "@/lib/utils";

type Range = { startDate: Date; endDate: Date };

/**
 * Sickness requests merged into spells: overlapping records are one spell, so
 * an absence recorded twice (or extended into another record) isn't counted
 * as two. Days are weekdays across the merged ranges, never double-counted.
 */
export function mergeSicknessSpells(requests: Range[]): Range[] {
  const sorted = [...requests].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const spells: Range[] = [];
  for (const r of sorted) {
    const last = spells[spells.length - 1];
    if (last && r.startDate <= last.endDate) {
      if (r.endDate > last.endDate) last.endDate = r.endDate;
    } else {
      spells.push({ startDate: r.startDate, endDate: r.endDate });
    }
  }
  return spells;
}

/** The single Bradford calculation: stored scores and reports must agree. */
export function bradfordForSickness(requests: Range[]): {
  spells: number;
  days: number;
  score: number;
} {
  const spells = mergeSicknessSpells(requests);
  const days = spells.reduce((sum, s) => sum + countWeekdays(s.startDate, s.endDate), 0);
  return { spells: spells.length, days, score: calculateBradfordFactor(spells.length, days) };
}

/** SSP: spells separated by 56 days or fewer link into one period of incapacity. */
export const PIW_LINK_DAYS = 56;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The prior SSP spells linked to a spell starting at `start`, following the
 * chain backwards (A links to B links to C, even when A is more than 56 days
 * before C), and the SSP days already paid across it. The 28-week cap applies
 * to the whole linked period, not just the spell immediately before.
 *
 * `prior` must only contain live spells (not rejected or cancelled) that end
 * before `start`.
 */
export function linkedPriorChain(
  prior: Array<Range & { sspDaysPaid: number | null }>,
  start: Date
): { linked: boolean; daysPaid: number; spells: number } {
  const byEndDesc = [...prior].sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
  let boundary = start;
  let daysPaid = 0;
  let spells = 0;
  for (const spell of byEndDesc) {
    if (spell.endDate >= boundary) {
      // Overlaps the chain already collected; still part of it.
      daysPaid += spell.sspDaysPaid ?? 0;
      spells += 1;
      if (spell.startDate < boundary) boundary = spell.startDate;
      continue;
    }
    if (boundary.getTime() - spell.endDate.getTime() > PIW_LINK_DAYS * DAY_MS) break;
    daysPaid += spell.sspDaysPaid ?? 0;
    spells += 1;
    if (spell.startDate < boundary) boundary = spell.startDate;
  }
  return { linked: spells > 0, daysPaid, spells };
}

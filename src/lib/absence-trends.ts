/**
 * Absence trend analysis — Scale tier feature.
 *
 * Returns monthly working-days-of-sickness per user across the trailing
 * 12 months. Used by the reports page to spot rising absence patterns
 * before they hit the Bradford-threshold alert.
 *
 * Deliberately distinct from Bradford Factor itself:
 *   - Bradford is a rolling 52-week single number (spells² × days). It
 *     answers "what's their current risk level?"
 *   - Trend series here is the per-month sickness-day count. It answers
 *     "is this getting worse over time?"
 *
 * The helper is pure (no Prisma, no time-of-day side effects) — the
 * route hands it the user list + the relevant leaves and reads the
 * shape back out. Months are bucketed by UTC start-of-month to avoid
 * DST / timezone wobble on the boundaries.
 */

import { countWeekdays } from "@/lib/utils";

export type UserForTrend = {
  id: string;
  name: string;
  bradfordScore: number;
};

export type SicknessLeaveForTrend = {
  userId: string;
  startDate: Date;
  endDate: Date;
};

export type MonthlyAbsenceMetric = {
  /** UTC midnight of the first of the month. */
  monthStart: Date;
  /** Year-month key (e.g. "2026-05") for stable UI keys + sorting. */
  monthKey: string;
  /** Working days of sickness that fell within this month. */
  days: number;
  /** Distinct sickness leaves that touched this month. */
  spells: number;
};

export type UserAbsenceTrend = {
  userId: string;
  name: string;
  currentBradfordScore: number;
  totalDaysLast12Months: number;
  totalSpellsLast12Months: number;
  /** Always exactly `monthsBack` entries, oldest first, even when zero. */
  monthlySeries: MonthlyAbsenceMetric[];
  /**
   * +1 / 0 / -1 — whether the second half of the period had MORE / equal /
   * FEWER absence days than the first half. Drives the UI's trend arrow.
   */
  direction: 1 | 0 | -1;
};

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthUtc(monthStart: Date): Date {
  return new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1) - 1
  );
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() > b.getTime() ? a : b;
}

function earlierOf(a: Date, b: Date): Date {
  return a.getTime() < b.getTime() ? a : b;
}

/**
 * Build the trailing-12-month series for every user with at least one
 * sickness leave touching the period. Users with no sickness are omitted
 * (the caller can union them in if they want a "no-absence" view).
 *
 * `leaves` is the pre-filtered set of sickness leaves the caller wants
 * to include — typically APPROVED + SSP/Sick type. We don't re-filter
 * by leave type here because the type-detection rule (`/SSP|Sick/i`)
 * already lives in `fit-note-alerts.ts` and the cron / route are the
 * appropriate places to apply it.
 */
export function computeAbsenceTrends(
  users: ReadonlyArray<UserForTrend>,
  leaves: ReadonlyArray<SicknessLeaveForTrend>,
  options: { now?: Date; monthsBack?: number } = {}
): UserAbsenceTrend[] {
  const now = options.now ?? new Date();
  const monthsBack = options.monthsBack ?? 12;

  const currentMonthStart = startOfMonthUtc(now);
  const months: Date[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    months.push(
      new Date(
        Date.UTC(
          currentMonthStart.getUTCFullYear(),
          currentMonthStart.getUTCMonth() - i,
          1
        )
      )
    );
  }

  const seriesByUser = new Map<string, UserAbsenceTrend>();
  const usersById = new Map(users.map((u) => [u.id, u] as const));

  function ensureUserRow(userId: string): UserAbsenceTrend | null {
    const user = usersById.get(userId);
    if (!user) return null;
    const existing = seriesByUser.get(userId);
    if (existing) return existing;
    const row: UserAbsenceTrend = {
      userId: user.id,
      name: user.name,
      currentBradfordScore: user.bradfordScore,
      totalDaysLast12Months: 0,
      totalSpellsLast12Months: 0,
      monthlySeries: months.map((m) => ({
        monthStart: m,
        monthKey: monthKey(m),
        days: 0,
        spells: 0,
      })),
      direction: 0,
    };
    seriesByUser.set(userId, row);
    return row;
  }

  for (const leave of leaves) {
    const row = ensureUserRow(leave.userId);
    if (!row) continue;

    // A leave can span multiple months — credit working days to each.
    for (let i = 0; i < months.length; i++) {
      const monthStart = months[i]!;
      const monthEnd = endOfMonthUtc(monthStart);
      // No overlap if leave is entirely before/after this month.
      if (leave.endDate < monthStart) continue;
      if (leave.startDate > monthEnd) continue;

      const overlapStart = laterOf(leave.startDate, monthStart);
      const overlapEnd = earlierOf(leave.endDate, monthEnd);
      const days = countWeekdays(overlapStart, overlapEnd);
      const bucket = row.monthlySeries[i]!;
      bucket.days += days;
      // Spell count is incremented once per leave that STARTS in this
      // month (or whose start was clipped to monthStart because it
      // began earlier). Use "earliest-bucket-overlap" semantics so a
      // single leave isn't double-counted across months.
      const startsHere =
        leave.startDate >= monthStart && leave.startDate <= monthEnd;
      if (startsHere) bucket.spells += 1;
    }
  }

  // Roll up totals + compute direction (later half vs. earlier half).
  for (const row of seriesByUser.values()) {
    let total = 0;
    let totalSpells = 0;
    for (const m of row.monthlySeries) {
      total += m.days;
      totalSpells += m.spells;
    }
    row.totalDaysLast12Months = total;
    row.totalSpellsLast12Months = totalSpells;

    const half = Math.floor(row.monthlySeries.length / 2);
    const firstHalfDays = row.monthlySeries
      .slice(0, half)
      .reduce((s, m) => s + m.days, 0);
    const secondHalfDays = row.monthlySeries
      .slice(half)
      .reduce((s, m) => s + m.days, 0);
    if (secondHalfDays > firstHalfDays) row.direction = 1;
    else if (secondHalfDays < firstHalfDays) row.direction = -1;
    else row.direction = 0;
  }

  // Drop users whose only leaves fell entirely outside the trailing
  // window — they create an empty row otherwise. Callers wanting a
  // "no-absence-yet" view can union the user list themselves.
  return Array.from(seriesByUser.values())
    .filter(
      (row) =>
        row.totalDaysLast12Months > 0 || row.totalSpellsLast12Months > 0
    )
    .sort(
      (a, b) => b.totalDaysLast12Months - a.totalDaysLast12Months
    );
}

/**
 * Shift-aware cover engine — the single source of truth for "is this team
 * covered on this day?". Pure (no DB), and works on YYYY-MM-DD strings so the
 * live check (local dates) and the analytics (UTC dates) can both feed it
 * without timezone drift.
 *
 * Two modes, chosen per region:
 *
 * - **Shift mode** (the region has shift types): each shift has a minimum per
 *   weekday. "Scheduled" = members whose working pattern puts them on that
 *   shift that weekday. Available = scheduled − on leave.
 * - **Legacy mode** (no shift types): one implicit all-day shift, every member
 *   is scheduled, required = region.minCover on the days the region checks
 *   (see coverDays.ts). Behaves exactly like cover did before shifts existed.
 *
 * A shift belongs to the date it starts on, so a Thu 20:00–Fri 08:00 night is
 * "Thu night" and leave covering Thursday takes the person off it.
 *
 * Mode is decided per day: days before any shift's `activeFrom` use legacy
 * mode, so reports covering the period before shifts were set up still
 * reflect the per-day rule that applied then.
 */
import { coverAppliesOn, type CoverDaySettings } from "./coverDays";

export const LEGACY_SHIFT_ID = "all-day";

/** Monday = 0 … Sunday = 6. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type EngineRegion = CoverDaySettings & { minCover: number };

export type EngineShift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  /** Length 7, Monday first. 0 = no minimum that day. */
  minCoverByWeekday: number[];
  /**
   * YYYY-MM-DD the shift was set up. Before it, the shift doesn't exist, so
   * history isn't judged against rules that weren't in place. Omit = always.
   */
  activeFrom?: string;
};

export type EnginePattern = {
  userId: string;
  shiftTypeId: string;
  weekday: number;
  /** YYYY-MM-DD, inclusive. */
  effectiveFrom: string;
  /** YYYY-MM-DD, inclusive; null = open-ended. */
  effectiveTo: string | null;
};

export type EngineLeave = {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  /** YYYY-MM-DD, inclusive. */
  end: string;
  leaveTypeName: string;
};

export type EngineInput = {
  region: EngineRegion;
  /** Active shift types; empty = legacy mode. */
  shifts: EngineShift[];
  patterns: EnginePattern[];
  /** Active region members, minus anyone the caller wants excluded. */
  members: Array<{ id: string; name: string }>;
  leavesByUser: ReadonlyMap<string, ReadonlyArray<EngineLeave>>;
  bankHolidayDates: ReadonlySet<string>;
  /** YYYY-MM-DD strings, in order. */
  days: string[];
};

export type ShiftCover = {
  shiftId: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  available: number;
  required: number;
  coverRequired: boolean;
  scheduledUserIds: string[];
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  staffAvailable: Array<{ id: string; name: string }>;
};

export type EngineDay = {
  date: string;
  isWeekend: boolean;
  isBankHoliday: boolean;
  shifts: ShiftCover[];
};

/** Monday-first weekday index for a YYYY-MM-DD string. */
export function weekdayIndex(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (jsDay + 6) % 7;
}

function leaveOn(
  leaves: ReadonlyArray<EngineLeave> | undefined,
  isoDate: string
): EngineLeave | null {
  if (!leaves) return null;
  for (const l of leaves) {
    if (l.start <= isoDate && l.end >= isoDate) return l;
  }
  return null;
}

function patternActive(p: EnginePattern, isoDate: string): boolean {
  return p.effectiveFrom <= isoDate && (p.effectiveTo === null || p.effectiveTo >= isoDate);
}

export function computeShiftCover(input: EngineInput): EngineDay[] {
  const memberById = new Map(input.members.map((m) => [m.id, m]));

  return input.days.map((date) => {
    const shiftsToday = input.shifts.filter(
      (s) => !s.activeFrom || s.activeFrom <= date
    );
    const legacy = shiftsToday.length === 0;
    const weekday = weekdayIndex(date);
    const isWeekend = weekday >= 5;
    const isBankHoliday = input.bankHolidayDates.has(date);

    const shiftDefs: Array<{
      id: string;
      name: string;
      startTime: string | null;
      endTime: string | null;
      required: number;
      coverRequired: boolean;
      scheduled: Array<{ id: string; name: string }>;
    }> = [];

    if (legacy) {
      shiftDefs.push({
        id: LEGACY_SHIFT_ID,
        name: "All day",
        startTime: null,
        endTime: null,
        required: input.region.minCover,
        coverRequired: coverAppliesOn({ isWeekend, isBankHoliday }, input.region),
        scheduled: input.members,
      });
    } else {
      for (const shift of shiftsToday) {
        const required = shift.minCoverByWeekday[weekday] ?? 0;
        const scheduledIds = new Set(
          input.patterns
            .filter(
              (p) =>
                p.shiftTypeId === shift.id &&
                p.weekday === weekday &&
                patternActive(p, date) &&
                memberById.has(p.userId)
            )
            .map((p) => p.userId)
        );
        // A shift that has no minimum and nobody scheduled isn't running.
        if (required === 0 && scheduledIds.size === 0) continue;
        shiftDefs.push({
          id: shift.id,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          required,
          // Per-weekday minimums replace the region's weekend flag in shift
          // mode; bank holidays still follow the region setting.
          coverRequired:
            required > 0 && !(isBankHoliday && !input.region.coverBankHolidays),
          scheduled: input.members.filter((m) => scheduledIds.has(m.id)),
        });
      }
    }

    const shifts: ShiftCover[] = shiftDefs.map((s) => {
      const staffOff: ShiftCover["staffOff"] = [];
      const staffAvailable: ShiftCover["staffAvailable"] = [];
      for (const m of s.scheduled) {
        const leave = leaveOn(input.leavesByUser.get(m.id), date);
        if (leave) {
          staffOff.push({ id: m.id, name: m.name, leaveType: leave.leaveTypeName });
        } else {
          staffAvailable.push({ id: m.id, name: m.name });
        }
      }
      return {
        shiftId: s.id,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        available: staffAvailable.length,
        required: s.required,
        coverRequired: s.coverRequired,
        scheduledUserIds: s.scheduled.map((m) => m.id),
        staffOff,
        staffAvailable,
      };
    });

    return { date, isWeekend, isBankHoliday, shifts };
  });
}

/**
 * The shift that's most at risk on a day: the enforced shift with the
 * smallest margin (available − required). Falls back to the first shift when
 * none are enforced. Used for per-day roll-ups (calendar, dashboard widget).
 */
export function worstShift(day: EngineDay): ShiftCover | null {
  const enforced = day.shifts.filter((s) => s.coverRequired);
  const pool = enforced.length > 0 ? enforced : day.shifts;
  let worst: ShiftCover | null = null;
  for (const s of pool) {
    if (!worst || s.available - s.required < worst.available - worst.required) {
      worst = s;
    }
  }
  return worst;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

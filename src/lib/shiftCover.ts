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

export type EngineMember = {
  id: string;
  name: string;
  /** Contract type, shown next to cover suggestions. */
  employmentType?: string | null;
};

export type CoverCandidate = {
  id: string;
  name: string;
  employmentType: string | null;
  /**
   * Hours their working pattern schedules in the Mon–Sun week of the short
   * shift, skipping days they're on leave. Scheduled, not worked: it's only as
   * accurate as the pattern.
   */
  weekHours: number;
};

/**
 * Someone not on the short shift who can't cover it, and why. Shown so a
 * manager doesn't ring them.
 */
export type RuledOutMember = {
  id: string;
  name: string;
  reason: "on_leave" | "rest";
  /** For "rest": the clashing shift, e.g. "Night shift until 08:00". */
  note: string | null;
};

export type EngineInput = {
  region: EngineRegion;
  /** Active shift types; empty = legacy mode. */
  shifts: EngineShift[];
  patterns: EnginePattern[];
  /** Active region members, minus anyone the caller wants excluded. */
  members: EngineMember[];
  /**
   * Patterns and leave must cover the Mon–Sun week(s) around `days`, plus a
   * day either side, for rest checks and candidates' weekly hours.
   */
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
  /**
   * For a short, enforced shift: members who could cover it — not already on
   * it, not on leave, and with no scheduled shift overlapping it or within
   * MIN_REST_MINUTES of it. Empty otherwise (and always in legacy mode, where
   * everyone already counts).
   */
  coverCandidates: CoverCandidate[];
  /** For a short shift: other members who can't cover it, with the reason. */
  ruledOut: RuledOutMember[];
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

/** UK Working Time Regulations: 11 consecutive hours' daily rest. */
export const MIN_REST_MINUTES = 11 * 60;
const MINUTES_PER_DAY = 24 * 60;

/** Monday of the week containing isoDate. */
export function weekStart(isoDate: string): string {
  return addDays(isoDate, -weekdayIndex(isoDate));
}

function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * [start, end) in minutes relative to midnight of the candidate shift's date.
 * Overnight shifts (end <= start) run into the next day.
 */
function shiftInterval(shift: EngineShift, dayOffset: number): [number, number] {
  const start = dayOffset * MINUTES_PER_DAY + toMinutes(shift.startTime);
  const length = (toMinutes(shift.endTime) - toMinutes(shift.startTime) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return [start, start + (length || MINUTES_PER_DAY)];
}

/** True when two shifts overlap or leave less than the minimum rest between them. */
function tooClose(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] + MIN_REST_MINUTES && b[0] < a[1] + MIN_REST_MINUTES;
}

/** Describes the shift that breaks rest, relative to the target shift. */
function restClashNote(
  target: [number, number],
  other: EngineShift,
  otherInterval: [number, number]
): string {
  if (otherInterval[1] <= target[0]) {
    const dayBefore = Math.floor((otherInterval[1] - 1) / MINUTES_PER_DAY) < 0;
    return `${other.name} shift until ${other.endTime}${dayBefore ? " the day before" : ""}`;
  }
  if (otherInterval[0] >= target[1]) {
    const nextDay = Math.floor(otherInterval[0] / MINUTES_PER_DAY) > 0;
    return `${other.name} shift from ${other.startTime}${nextDay ? " the next day" : ""}`;
  }
  return `On the ${other.name} shift, ${other.startTime}–${other.endTime}`;
}

export function computeShiftCover(input: EngineInput): EngineDay[] {
  const memberById = new Map(input.members.map((m) => [m.id, m]));

  const shiftsOn = (date: string) =>
    input.shifts.filter((s) => !s.activeFrom || s.activeFrom <= date);

  /** Shifts a member is scheduled on for a date, per their pattern. Memoised:
   * candidate rest checks and weekly hours ask for the same days repeatedly. */
  const scheduledCache = new Map<string, EngineShift[]>();
  const scheduledShifts = (userId: string, date: string): EngineShift[] => {
    const key = `${userId}|${date}`;
    const cached = scheduledCache.get(key);
    if (cached) return cached;
    const weekday = weekdayIndex(date);
    const ids = new Set(
      input.patterns
        .filter((p) => p.userId === userId && p.weekday === weekday && patternActive(p, date))
        .map((p) => p.shiftTypeId)
    );
    const result = shiftsOn(date).filter((s) => ids.has(s.id));
    scheduledCache.set(key, result);
    return result;
  };

  const weekHours = (userId: string, date: string): number => {
    const monday = weekStart(date);
    let minutes = 0;
    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      if (leaveOn(input.leavesByUser.get(userId), day)) continue;
      for (const s of scheduledShifts(userId, day)) {
        const [start, end] = shiftInterval(s, 0);
        minutes += end - start;
      }
    }
    return Math.round((minutes / 60) * 10) / 10;
  };

  const candidatesFor = (
    shift: EngineShift,
    date: string,
    scheduledIds: ReadonlySet<string>
  ): { candidates: CoverCandidate[]; ruledOut: RuledOutMember[] } => {
    const target = shiftInterval(shift, 0);
    const candidates: CoverCandidate[] = [];
    const ruledOut: RuledOutMember[] = [];
    for (const m of input.members) {
      if (scheduledIds.has(m.id)) continue;
      if (leaveOn(input.leavesByUser.get(m.id), date)) {
        ruledOut.push({ id: m.id, name: m.name, reason: "on_leave", note: null });
        continue;
      }
      let clash: string | null = null;
      for (const offset of [-1, 0, 1]) {
        for (const other of scheduledShifts(m.id, addDays(date, offset))) {
          const interval = shiftInterval(other, offset);
          if (tooClose(target, interval)) {
            clash = restClashNote(target, other, interval);
            break;
          }
        }
        if (clash) break;
      }
      if (clash) {
        ruledOut.push({ id: m.id, name: m.name, reason: "rest", note: clash });
      } else {
        candidates.push({
          id: m.id,
          name: m.name,
          employmentType: m.employmentType ?? null,
          weekHours: weekHours(m.id, date),
        });
      }
    }
    return { candidates, ruledOut };
  };

  return input.days.map((date) => {
    const shiftsToday = shiftsOn(date);
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
      scheduled: EngineMember[];
      shift: EngineShift | null;
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
        shift: null,
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
          shift,
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
      const short = s.coverRequired && staffAvailable.length < s.required;
      const cover =
        short && s.shift
          ? candidatesFor(s.shift, date, new Set(s.scheduled.map((m) => m.id)))
          : { candidates: [], ruledOut: [] };
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
        coverCandidates: cover.candidates,
        ruledOut: cover.ruledOut,
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

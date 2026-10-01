import { eachDayOfInterval, parseISO, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  computeShiftCover,
  worstShift,
  LEGACY_SHIFT_ID,
  type EngineLeave,
  type EnginePattern,
  type CoverCandidate,
  type EngineMember,
  type EngineShift,
  type RuledOutMember,
  type ShiftCover,
  weekStart,
} from "@/lib/shiftCover";

export type ConflictDay = {
  date: string;
  available: number;
  required: number;
  shortfall: number;
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  /** Set when the region uses shifts; null for per-day (legacy) cover. */
  shiftId: string | null;
  shiftName: string | null;
  /** Who could cover this shift (shift mode only). See ShiftCover. */
  coverCandidates: CoverCandidate[];
  /** Who can't, and why (shift mode only). See ShiftCover. */
  ruledOut: RuledOutMember[];
};

export type CoverCheckResult = {
  hasConflict: boolean;
  conflicts: ConflictDay[];
  regionId: string | null;
  regionName: string | null;
  minCover: number | null;
  /** True when the region has shift types and cover is checked per shift. */
  usesShifts: boolean;
  /**
   * False when the region uses shifts but the requester isn't on any shift in
   * the range (no working pattern), so their leave can't affect cover.
   */
  requesterScheduled: boolean;
};

export type DailyCover = {
  date: string;
  /** Roll-up: the most at-risk shift's numbers (or the day's, in legacy mode). */
  available: number;
  required: number;
  isWeekend: boolean;
  isBankHoliday: boolean;
  /** False when no cover rule applies on this day. */
  coverRequired: boolean;
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  staffAvailable: Array<{ id: string; name: string }>;
  /** Per-shift breakdown; empty for regions without shift types. */
  shifts: ShiftCover[];
};

const DEFAULT_PRESET_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

export const REGION_PRESET_COLORS = DEFAULT_PRESET_COLORS;

export function pickPresetColor(existingCount: number): string {
  return DEFAULT_PRESET_COLORS[existingCount % DEFAULT_PRESET_COLORS.length];
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** The UK calendar date of an instant, as YYYY-MM-DD. */
function ukIsoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

/** @db.Date columns come back as UTC midnight; read them as UTC. */
function isoDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayList(start: Date, end: Date): string[] {
  return eachDayOfInterval({ start, end }).map(isoDay);
}

/**
 * The calendar days in [start, end] plus the matching DB query bounds.
 * Leave, bank holiday and pattern dates are stored at UTC midnight, so the
 * bounds must be UTC midnight too — using local midnight drops rows on the
 * last day whenever the server isn't on UTC (e.g. BST in local dev).
 */
function isoPlusDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * `from`/`to` bound the days being judged. `loadFrom`/`loadTo` are wider —
 * the Mon–Sun weeks around them plus a day either side — so patterns and
 * leave are there for rest checks and candidates' weekly hours.
 */
function dayWindow(start: Date, end: Date) {
  const days = dayList(start, end);
  const first = days[0];
  const last = days[days.length - 1];
  return {
    days,
    from: new Date(`${first}T00:00:00Z`),
    to: new Date(`${last}T00:00:00Z`),
    loadFrom: new Date(`${isoPlusDays(weekStart(first), -1)}T00:00:00Z`),
    loadTo: new Date(`${isoPlusDays(weekStart(last), 7)}T00:00:00Z`),
  };
}

/**
 * Returns the set of YYYY-MM-DD strings that are bank holidays for the org's
 * configured BankHolidayRegion within the date window.
 */
export async function loadBankHolidaySet(
  organizationId: string,
  start: Date,
  end: Date
): Promise<Set<string>> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ukBankHolidayRegion: true, ukBankHolidayInclusive: true },
  });
  if (!org || !org.ukBankHolidayInclusive) return new Set();

  const holidays = await prisma.bankHoliday.findMany({
    where: {
      organizationId,
      region: org.ukBankHolidayRegion,
      date: { gte: start, lte: end },
    },
    select: { date: true },
  });
  return new Set(holidays.map((h) => isoDbDate(h.date)));
}

/** Active member roster for a region. */
async function loadRegionMembers(
  regionId: string,
  excludeUserId?: string
): Promise<EngineMember[]> {
  return prisma.user.findMany({
    where: {
      regionId,
      isActive: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true, name: true, employmentType: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Approved leaves overlapping [start, end] for the given userIds, keyed by
 * userId, as engine leaves (YYYY-MM-DD, local).
 */
async function loadApprovedLeavesOverlapping(
  userIds: string[],
  start: Date,
  end: Date,
  excludeRequestId?: string
): Promise<Map<string, EngineLeave[]>> {
  if (userIds.length === 0) return new Map();
  const requests = await prisma.leaveRequest.findMany({
    where: {
      userId: { in: userIds },
      status: "APPROVED",
      startDate: { lte: end },
      endDate: { gte: start },
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
    },
    select: {
      userId: true,
      startDate: true,
      endDate: true,
      leaveType: { select: { name: true } },
    },
  });
  const map = new Map<string, EngineLeave[]>();
  for (const r of requests) {
    const list = map.get(r.userId) ?? [];
    list.push({
      start: isoDbDate(r.startDate),
      end: isoDbDate(r.endDate),
      leaveTypeName: r.leaveType.name,
    });
    map.set(r.userId, list);
  }
  return map;
}

/**
 * Prisma `select` for a region's shift types and the working patterns that
 * overlap [start, end]. Pair with `toEngineShiftData`.
 */
export function shiftTypesSelect(start: Date, end: Date) {
  return {
    orderBy: [{ sortOrder: "asc" as const }, { startTime: "asc" as const }],
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
      minCoverByWeekday: true,
      createdAt: true,
      patterns: {
        where: {
          effectiveFrom: { lte: end },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
        },
        select: {
          userId: true,
          shiftTypeId: true,
          weekday: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      },
    },
  };
}

type ShiftTypeRow = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  minCoverByWeekday: number[];
  createdAt: Date;
  patterns: Array<{
    userId: string;
    shiftTypeId: string;
    weekday: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }>;
};

export function toEngineShiftData(shiftTypes: ShiftTypeRow[]): {
  shifts: EngineShift[];
  patterns: EnginePattern[];
} {
  return {
    shifts: shiftTypes.map((s) => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      minCoverByWeekday: s.minCoverByWeekday,
      activeFrom: ukIsoDate(s.createdAt),
    })),
    patterns: shiftTypes.flatMap((s) =>
      s.patterns.map((p) => ({
        userId: p.userId,
        shiftTypeId: p.shiftTypeId,
        weekday: p.weekday,
        effectiveFrom: isoDbDate(p.effectiveFrom),
        effectiveTo: p.effectiveTo ? isoDbDate(p.effectiveTo) : null,
      }))
    ),
  };
}

type LoadedRegion = {
  id: string;
  name: string;
  minCover: number;
  isActive: boolean;
  coverWeekends: boolean;
  coverBankHolidays: boolean;
  shifts: EngineShift[];
  patterns: EnginePattern[];
};

/** Region plus its shift types and every working pattern overlapping the window. */
async function loadRegionWithShifts(
  organizationId: string,
  regionId: string,
  start: Date,
  end: Date
): Promise<LoadedRegion | null> {
  const region = await prisma.region.findFirst({
    where: { id: regionId, organizationId },
    select: {
      id: true,
      name: true,
      minCover: true,
      isActive: true,
      coverWeekends: true,
      coverBankHolidays: true,
      shiftTypes: shiftTypesSelect(start, end),
    },
  });
  if (!region) return null;
  return {
    id: region.id,
    name: region.name,
    minCover: region.minCover,
    isActive: region.isActive,
    coverWeekends: region.coverWeekends,
    coverBankHolidays: region.coverBankHolidays,
    ...toEngineShiftData(region.shiftTypes),
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

export type DailyCoverInput = {
  organizationId: string;
  regionId: string;
  start: Date;
  end: Date;
  excludeUserId?: string;
  excludeRequestId?: string;
};

export async function computeDailyCover(
  input: DailyCoverInput
): Promise<DailyCover[]> {
  const { days: dayStrings, from, to, loadFrom, loadTo } = dayWindow(
    input.start,
    input.end
  );
  const region = await loadRegionWithShifts(
    input.organizationId,
    input.regionId,
    loadFrom,
    loadTo
  );
  if (!region) return [];

  const members = await loadRegionMembers(region.id, input.excludeUserId);
  const leavesByUser = await loadApprovedLeavesOverlapping(
    members.map((m) => m.id),
    loadFrom,
    loadTo,
    input.excludeRequestId
  );
  const bankHolidayDates = await loadBankHolidaySet(input.organizationId, from, to);

  const days = computeShiftCover({
    region,
    shifts: region.shifts,
    patterns: region.patterns,
    members,
    leavesByUser,
    bankHolidayDates,
    days: dayStrings,
  });

  return days.map((day) => {
    const worst = worstShift(day);
    return {
      date: day.date,
      available: worst?.available ?? 0,
      required: worst?.required ?? 0,
      isWeekend: day.isWeekend,
      isBankHoliday: day.isBankHoliday,
      coverRequired: day.shifts.some((s) => s.coverRequired),
      staffOff: uniqueById(day.shifts.flatMap((s) => s.staffOff)),
      staffAvailable: uniqueById(day.shifts.flatMap((s) => s.staffAvailable)),
      shifts: day.shifts.filter((s) => s.shiftId !== LEGACY_SHIFT_ID),
    };
  });
}

function emptyResult(
  regionId: string | null,
  regionName: string | null,
  minCover: number | null
): CoverCheckResult {
  return {
    hasConflict: false,
    conflicts: [],
    regionId,
    regionName,
    minCover,
    usesShifts: false,
    requesterScheduled: true,
  };
}

/**
 * Core check used at submit and approval time: would the requester being off
 * across [startDate, endDate] leave any day (or, with shifts, any shift they
 * work) below its minimum?
 */
export async function checkRegionalCover(params: {
  organizationId: string;
  userId: string;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}): Promise<CoverCheckResult> {
  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { regionsEnabled: true },
  });
  if (!org?.regionsEnabled) return emptyResult(null, null, null);

  const employee = await prisma.user.findFirst({
    where: { id: params.userId, organizationId: params.organizationId },
    select: { regionId: true },
  });
  if (!employee || !employee.regionId) return emptyResult(null, null, null);

  const start = parseISO(params.startDate);
  const end = parseISO(params.endDate);
  const { from, to, loadFrom, loadTo } = dayWindow(start, end);

  const region = await loadRegionWithShifts(
    params.organizationId,
    employee.regionId,
    loadFrom,
    loadTo
  );
  if (!region || !region.isActive) {
    return emptyResult(
      employee.regionId,
      region?.name ?? null,
      region?.minCover ?? null
    );
  }

  const members = await loadRegionMembers(region.id, params.userId);
  const leavesByUser = await loadApprovedLeavesOverlapping(
    members.map((m) => m.id),
    loadFrom,
    loadTo,
    params.excludeRequestId
  );
  const bankHolidayDates = await loadBankHolidaySet(params.organizationId, from, to);

  return checkRegionalCoverPure({
    region,
    employeeRegionId: region.id,
    employeeId: params.userId,
    start,
    end,
    members,
    approvedLeavesByUser: leavesByUser,
    bankHolidayDates,
    shifts: region.shifts,
    patterns: region.patterns,
  });
}

/**
 * Pure core of the cover check. No DB access. Date inputs are local-midnight
 * JS Dates. `members` excludes the requesting employee; the requester is added
 * back as "on leave" for the requested range so every rule (legacy or shift)
 * runs through the same engine.
 */
export type PureCheckInput = {
  region: {
    id: string;
    name: string;
    minCover: number;
    isActive: boolean;
    coverWeekends: boolean;
    coverBankHolidays: boolean;
  } | null;
  employeeRegionId: string | null;
  employeeId: string;
  start: Date;
  end: Date;
  members: EngineMember[]; // excluding the requesting employee
  approvedLeavesByUser: ReadonlyMap<string, ReadonlyArray<EngineLeave>>;
  bankHolidayDates: Set<string>;
  /** Active shift types; omit or [] for per-day cover. */
  shifts?: EngineShift[];
  patterns?: EnginePattern[];
};

const REQUESTED_LEAVE = "Requested leave";

export function checkRegionalCoverPure(input: PureCheckInput): CoverCheckResult {
  if (!input.employeeRegionId || !input.region || !input.region.isActive) {
    return emptyResult(
      input.employeeRegionId,
      input.region?.name ?? null,
      input.region?.minCover ?? null
    );
  }

  const shifts = input.shifts ?? [];
  const usesShifts = shifts.length > 0;
  const days = dayList(input.start, input.end);

  const leavesByUser = new Map(input.approvedLeavesByUser);
  leavesByUser.set(input.employeeId, [
    { start: days[0], end: days[days.length - 1], leaveTypeName: REQUESTED_LEAVE },
  ]);

  const engineDays = computeShiftCover({
    region: input.region,
    shifts,
    patterns: input.patterns ?? [],
    members: [
      ...input.members.filter((m) => m.id !== input.employeeId),
      { id: input.employeeId, name: "" },
    ],
    leavesByUser,
    bankHolidayDates: input.bankHolidayDates,
    days,
  });

  const conflicts: ConflictDay[] = [];
  let requesterScheduled = !usesShifts;

  for (const day of engineDays) {
    for (const s of day.shifts) {
      // The requester's absence only matters on shifts they'd have worked.
      if (!s.scheduledUserIds.includes(input.employeeId)) continue;
      requesterScheduled = true;
      if (!s.coverRequired || s.available >= s.required) continue;
      conflicts.push({
        date: day.date,
        available: s.available,
        required: s.required,
        shortfall: s.required - s.available,
        staffOff: s.staffOff.filter((o) => o.id !== input.employeeId),
        shiftId: s.shiftId === LEGACY_SHIFT_ID ? null : s.shiftId,
        shiftName: s.shiftId === LEGACY_SHIFT_ID ? null : s.name,
        coverCandidates: s.coverCandidates,
        ruledOut: s.ruledOut.filter((o) => o.id !== input.employeeId),
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    regionId: input.region.id,
    regionName: input.region.name,
    minCover: input.region.minCover,
    usesShifts,
    requesterScheduled,
  };
}

/**
 * Cover-candidate suggestions are a manager tool; staff checking their own
 * leave see the gap but not a list of colleagues to lean on.
 */
export function canSeeCoverCandidates(role: string | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function withoutCoverCandidates(result: CoverCheckResult): CoverCheckResult {
  return {
    ...result,
    conflicts: result.conflicts.map((c) => ({ ...c, coverCandidates: [], ruledOut: [] })),
  };
}

export function dailyWithoutCoverCandidates(days: DailyCover[]): DailyCover[] {
  return days.map((d) => ({
    ...d,
    shifts: d.shifts.map((s) => ({ ...s, coverCandidates: [], ruledOut: [] })),
  }));
}

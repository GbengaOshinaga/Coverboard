import { eachDayOfInterval, parseISO, isWeekend, format } from "date-fns";
import { prisma } from "@/lib/prisma";

export type ConflictDay = {
  date: string;
  available: number;
  required: number;
  shortfall: number;
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
};

export type CoverCheckResult = {
  hasConflict: boolean;
  conflicts: ConflictDay[];
  regionId: string | null;
  regionName: string | null;
  minCover: number | null;
};

export type DailyCover = {
  date: string;
  available: number;
  required: number;
  isWeekend: boolean;
  isBankHoliday: boolean;
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  staffAvailable: Array<{ id: string; name: string }>;
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

/**
 * Returns the set of YYYY-MM-DD strings that are bank holidays for the org's
 * configured BankHolidayRegion within the date window.
 */
async function loadBankHolidaySet(
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
  return new Set(holidays.map((h) => format(h.date, "yyyy-MM-dd")));
}

/**
 * Active member roster for a region (excludes the deleted-org stub case
 * automatically because stubs have no members).
 */
async function loadRegionMembers(
  regionId: string,
  excludeUserId?: string
): Promise<Array<{ id: string; name: string }>> {
  return prisma.user.findMany({
    where: {
      regionId,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Approved leaves overlapping [start, end] for the given userIds. Returns a
 * map keyed by userId of overlapping requests with leaveType name.
 */
async function loadApprovedLeavesOverlapping(
  userIds: string[],
  start: Date,
  end: Date,
  excludeRequestId?: string
): Promise<
  Map<string, Array<{ startDate: Date; endDate: Date; leaveTypeName: string }>>
> {
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
  const map = new Map<
    string,
    Array<{ startDate: Date; endDate: Date; leaveTypeName: string }>
  >();
  for (const r of requests) {
    const list = map.get(r.userId) ?? [];
    list.push({
      startDate: r.startDate,
      endDate: r.endDate,
      leaveTypeName: r.leaveType.name,
    });
    map.set(r.userId, list);
  }
  return map;
}

function leaveSpansDay(
  leaves: Array<{ startDate: Date; endDate: Date; leaveTypeName: string }>,
  day: Date
): { active: boolean; leaveTypeName: string | null } {
  const dayIso = isoDay(day);
  for (const l of leaves) {
    if (isoDay(l.startDate) <= dayIso && isoDay(l.endDate) >= dayIso) {
      return { active: true, leaveTypeName: l.leaveTypeName };
    }
  }
  return { active: false, leaveTypeName: null };
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
  const region = await prisma.region.findFirst({
    where: { id: input.regionId, organizationId: input.organizationId },
    select: { id: true, minCover: true, isActive: true },
  });
  if (!region) return [];

  const members = await loadRegionMembers(region.id, input.excludeUserId);
  const memberIds = members.map((m) => m.id);
  const leavesByUser = await loadApprovedLeavesOverlapping(
    memberIds,
    input.start,
    input.end,
    input.excludeRequestId
  );
  const bankHolidays = await loadBankHolidaySet(
    input.organizationId,
    input.start,
    input.end
  );

  const days = eachDayOfInterval({ start: input.start, end: input.end });
  return days.map((day) => {
    const isoDate = format(day, "yyyy-MM-dd");
    const weekend = isWeekend(day);
    const bankHoliday = bankHolidays.has(isoDate);

    const staffOff: Array<{ id: string; name: string; leaveType: string | null }> = [];
    const staffAvailable: Array<{ id: string; name: string }> = [];

    for (const m of members) {
      const status = leaveSpansDay(leavesByUser.get(m.id) ?? [], day);
      if (status.active) {
        staffOff.push({ id: m.id, name: m.name, leaveType: status.leaveTypeName });
      } else {
        staffAvailable.push({ id: m.id, name: m.name });
      }
    }

    return {
      date: isoDate,
      available: staffAvailable.length,
      required: region.minCover,
      isWeekend: weekend,
      isBankHoliday: bankHoliday,
      staffOff,
      staffAvailable,
    };
  });
}

/**
 * Core check used at submit and approval time. Excludes weekends and bank
 * holidays per spec.
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
  if (!org?.regionsEnabled) {
    return {
      hasConflict: false,
      conflicts: [],
      regionId: null,
      regionName: null,
      minCover: null,
    };
  }

  const employee = await prisma.user.findFirst({
    where: { id: params.userId, organizationId: params.organizationId },
    select: { regionId: true },
  });
  if (!employee || !employee.regionId) {
    return {
      hasConflict: false,
      conflicts: [],
      regionId: null,
      regionName: null,
      minCover: null,
    };
  }

  const region = await prisma.region.findFirst({
    where: { id: employee.regionId, organizationId: params.organizationId },
    select: { id: true, name: true, minCover: true, isActive: true },
  });
  if (!region || !region.isActive) {
    return {
      hasConflict: false,
      conflicts: [],
      regionId: employee.regionId,
      regionName: region?.name ?? null,
      minCover: region?.minCover ?? null,
    };
  }

  const start = parseISO(params.startDate);
  const end = parseISO(params.endDate);

  const daily = await computeDailyCover({
    organizationId: params.organizationId,
    regionId: region.id,
    start,
    end,
    excludeUserId: params.userId,
    excludeRequestId: params.excludeRequestId,
  });

  const conflicts: ConflictDay[] = [];
  for (const d of daily) {
    if (d.isWeekend || d.isBankHoliday) continue;
    if (d.available < region.minCover) {
      conflicts.push({
        date: d.date,
        available: d.available,
        required: region.minCover,
        shortfall: region.minCover - d.available,
        staffOff: d.staffOff,
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    regionId: region.id,
    regionName: region.name,
    minCover: region.minCover,
  };
}

/**
 * Pure helper used by tests. Given employee+region+leaves+bank-holidays it
 * returns the conflicts. No DB access. Date inputs are JS Dates (UTC midnight).
 */
export type PureCheckInput = {
  region: { id: string; name: string; minCover: number; isActive: boolean } | null;
  employeeRegionId: string | null;
  employeeId: string;
  start: Date;
  end: Date;
  members: Array<{ id: string; name: string }>; // excluding the requesting employee
  approvedLeavesByUser: Map<
    string,
    Array<{ startDate: Date; endDate: Date; leaveTypeName: string }>
  >;
  bankHolidayDates: Set<string>;
};

export function checkRegionalCoverPure(input: PureCheckInput): CoverCheckResult {
  if (!input.employeeRegionId || !input.region || !input.region.isActive) {
    return {
      hasConflict: false,
      conflicts: [],
      regionId: input.employeeRegionId,
      regionName: input.region?.name ?? null,
      minCover: input.region?.minCover ?? null,
    };
  }

  const conflicts: ConflictDay[] = [];
  const days = eachDayOfInterval({ start: input.start, end: input.end });

  for (const day of days) {
    const isoDate = format(day, "yyyy-MM-dd");
    if (isWeekend(day)) continue;
    if (input.bankHolidayDates.has(isoDate)) continue;

    const staffOff: ConflictDay["staffOff"] = [];
    let available = 0;
    for (const m of input.members) {
      const status = leaveSpansDay(
        input.approvedLeavesByUser.get(m.id) ?? [],
        day
      );
      if (status.active) {
        staffOff.push({ id: m.id, name: m.name, leaveType: status.leaveTypeName });
      } else {
        available++;
      }
    }

    if (available < input.region.minCover) {
      conflicts.push({
        date: isoDate,
        available,
        required: input.region.minCover,
        shortfall: input.region.minCover - available,
        staffOff,
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    regionId: input.region.id,
    regionName: input.region.name,
    minCover: input.region.minCover,
  };
}

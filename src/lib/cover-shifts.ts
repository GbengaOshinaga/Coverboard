import { prisma } from "@/lib/prisma";

/**
 * Accepted cover offers as worked shifts: who covered what, when, and for how
 * long. One loader feeds the payroll export, the calendar and the weekly
 * hours view, so they always agree.
 */

/** Hours in a shift given "HH:MM" times; an end at or before the start runs overnight. */
export function shiftLengthHours(startTime: string, endTime: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const minutes = (toMin(endTime) - toMin(startTime) + 24 * 60) % (24 * 60) || 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

export type CoverShiftRow = {
  offerId: string;
  userId: string;
  userName: string;
  email: string;
  department: string | null;
  employmentType: string;
  /** YYYY-MM-DD the shift starts. */
  date: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  hours: number;
  locationId: string;
  locationName: string;
  /** Whose absence it covered, when the ask came from one. */
  coveringFor: string | null;
};

export async function loadAcceptedCoverShifts(params: {
  organizationId: string;
  from: Date;
  to: Date;
  userId?: string;
}): Promise<CoverShiftRow[]> {
  const rows = await prisma.coverOffer.findMany({
    where: {
      organizationId: params.organizationId,
      status: "ACCEPTED",
      date: { gte: params.from, lte: params.to },
      ...(params.userId ? { userId: params.userId } : {}),
    },
    orderBy: [{ date: "asc" }],
    select: {
      id: true,
      date: true,
      user: { select: { id: true, name: true, email: true, department: true, employmentType: true } },
      shiftType: {
        select: { name: true, startTime: true, endTime: true, region: { select: { id: true, name: true } } },
      },
      leaveRequest: { select: { user: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    offerId: r.id,
    userId: r.user.id,
    userName: r.user.name,
    email: r.user.email,
    department: r.user.department,
    employmentType: r.user.employmentType,
    date: r.date.toISOString().slice(0, 10),
    shiftName: r.shiftType.name,
    startTime: r.shiftType.startTime,
    endTime: r.shiftType.endTime,
    hours: shiftLengthHours(r.shiftType.startTime, r.shiftType.endTime),
    locationId: r.shiftType.region.id,
    locationName: r.shiftType.region.name,
    coveringFor: r.leaveRequest?.user.name ?? null,
  }));
}

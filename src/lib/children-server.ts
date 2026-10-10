import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkingWeek } from "@/lib/working-week-server";
import {
  eighteenthBirthday,
  hasIrregularHours,
  uplEntitledFrom,
  uplUsage,
  uplWholeWeeksChecked,
  uplYearContaining,
} from "@/lib/unpaid-parental";

/**
 * Children are needed for unpaid parental leave, which is per child. The
 * person themselves can manage theirs (they book the leave); so can admins
 * and managers. Returns the session details, or a response to send back.
 */
export async function childrenAccess(memberId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const role = sessionUser.role as string;
  if (memberId !== sessionUser.id && role !== "ADMIN" && role !== "MANAGER") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const member = await prisma.user.findFirst({
    where: { id: memberId, organizationId: orgId },
    select: { id: true },
  });
  if (!member) {
    return { error: NextResponse.json({ error: "Member not found" }, { status: 404 }) };
  }
  return {
    orgId,
    actor: { id: sessionUser.id as string, email: (sessionUser.email as string) ?? null, role },
  };
}

export type ChildWithUsage = {
  id: string;
  label: string | null;
  dateOfBirth: string;
  eighteenthBirthday: string;
  /** Adopted: when they were placed (YYYY-MM-DD). */
  placedOn: string | null;
  disabilityBenefit: boolean;
  weeksTakenElsewhere: number;
  hasLeave: boolean;
  /** Working days of unpaid parental leave used and allowed. */
  usage: { daysThisYear: number; capThisYear: number; daysTotal: number; capTotal: number };
  /** The child's current parental-leave year (YYYY-MM-DD), from when the parent became entitled. */
  year: { start: string; end: string };
  /** Later years with leave already booked in them, and the working days booked. */
  laterYears: { start: string; end: string; days: number }[];
  /**
   * Bookings must be whole weeks: no disability benefit, and a working week
   * the booking can be checked against (the same test as when booking).
   */
  wholeWeeksOnly: boolean;
};

/** A member's children with their unpaid parental leave used so far. */
export async function listChildren(userId: string): Promise<ChildWithUsage[]> {
  const [children, week, parent] = await Promise.all([
    prisma.child.findMany({
      where: { userId },
      orderBy: { dateOfBirth: "asc" },
      include: {
        leaveRequests: {
          where: { status: { in: ["APPROVED", "PENDING"] } },
          select: { startDate: true, endDate: true },
        },

      },
    }),
    getWorkingWeek(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { serviceStartDate: true, employmentType: true, daysWorkedPerWeek: true },
    }),
  ]);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const weeksChecked = uplWholeWeeksChecked({ ...week, irregularHours: hasIrregularHours(parent) });
  return children.map((c) => {
    const entitledFrom = uplEntitledFrom(c, parent?.serviceStartDate ?? null);
    // Not before they're entitled (a placement still to come).
    const today = new Date();
    const year = uplYearContaining(today > entitledFrom ? today : entitledFrom, entitledFrom);
    const usageIn = (y: { start: Date; end: Date }) =>
      uplUsage({
        bookings: c.leaveRequests,
        year: y,
        weeksTakenElsewhere: c.weeksTakenElsewhere,
        daysPerWeek: week.daysPerWeek,
        weekdays: week.weekdays,
      });
    // A booking next year doesn't show in this year's count, so list those years too.
    const lastEnd = c.leaveRequests.reduce<Date | null>((m, b) => (!m || b.endDate > m ? b.endDate : m), null);
    const laterYears: ChildWithUsage["laterYears"] = [];
    for (
      let y = uplYearContaining(new Date(year.end.getTime() + 86_400_000), entitledFrom);
      lastEnd && y.start <= lastEnd;
      y = uplYearContaining(new Date(y.end.getTime() + 86_400_000), entitledFrom)
    ) {
      const days = usageIn(y).daysThisYear;
      if (days > 0) laterYears.push({ start: ymd(y.start), end: ymd(y.end), days });
    }
    return {
      id: c.id,
      label: c.label,
      dateOfBirth: c.dateOfBirth.toISOString().slice(0, 10),
      eighteenthBirthday: eighteenthBirthday(c.dateOfBirth).toISOString().slice(0, 10),
      placedOn: c.placedOn ? c.placedOn.toISOString().slice(0, 10) : null,
      disabilityBenefit: c.disabilityBenefit,
      weeksTakenElsewhere: c.weeksTakenElsewhere,
      hasLeave: c.leaveRequests.length > 0,
      usage: usageIn(year),
      year: { start: ymd(year.start), end: ymd(year.end) },
      laterYears,
      wholeWeeksOnly: !c.disabilityBenefit && weeksChecked,
    };
  });
}

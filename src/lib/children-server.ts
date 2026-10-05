import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkingWeek } from "@/lib/working-week-server";
import { eighteenthBirthday, uplUsage } from "@/lib/unpaid-parental";

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
  weeksTakenElsewhere: number;
  hasLeave: boolean;
  /** Working days of unpaid parental leave used and allowed. */
  usage: { daysThisYear: number; capThisYear: number; daysTotal: number; capTotal: number };
};

/** A member's children with their unpaid parental leave used so far. */
export async function listChildren(userId: string): Promise<ChildWithUsage[]> {
  const [children, week] = await Promise.all([
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
  ]);
  const year = new Date().getUTCFullYear();
  return children.map((c) => ({
    id: c.id,
    label: c.label,
    dateOfBirth: c.dateOfBirth.toISOString().slice(0, 10),
    eighteenthBirthday: eighteenthBirthday(c.dateOfBirth).toISOString().slice(0, 10),
    weeksTakenElsewhere: c.weeksTakenElsewhere,
    hasLeave: c.leaveRequests.length > 0,
    usage: uplUsage({
      bookings: c.leaveRequests,
      year,
      weeksTakenElsewhere: c.weeksTakenElsewhere,
      daysPerWeek: week.daysPerWeek,
      weekdays: week.weekdays,
    }),
  }));
}

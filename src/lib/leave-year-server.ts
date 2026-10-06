import { prisma } from "@/lib/prisma";
import { CALENDAR_LEAVE_YEAR, leaveYearOf, type LeaveYearStart } from "@/lib/leave-year";

/** A team's leave year start (1 January when not set). */
export async function getLeaveYearStart(organizationId: string): Promise<LeaveYearStart> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { leaveYearStartMonth: true, leaveYearStartDay: true },
  });
  return org ? { month: org.leaveYearStartMonth, day: org.leaveYearStartDay } : CALENDAR_LEAVE_YEAR;
}

/** The leave year a date falls in for a team (default: today). */
export async function leaveYearForOrg(organizationId: string, date: Date = new Date()): Promise<number> {
  return leaveYearOf(date, await getLeaveYearStart(organizationId));
}

import { prisma } from "@/lib/prisma";
import { isHoursAveragedEmploymentType } from "@/lib/employment-types";
import { describeFte, type Fte } from "@/lib/fte";

/** FTE for a set of members of one team (one query for logged hours). */
export async function ftesFor(
  organizationId: string,
  members: { id: string; employmentType: string; fteRatio: number }[]
): Promise<Map<string, Fte>> {
  const hourly = members.filter((m) => isHoursAveragedEmploymentType(m.employmentType)).map((m) => m.id);
  const [org, rows] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { fullTimeHoursPerWeek: true },
    }),
    hourly.length === 0
      ? Promise.resolve([])
      : prisma.userWeeklyHours.findMany({
          where: {
            userId: { in: hourly },
            weekStartDate: { gte: new Date(Date.now() - 52 * 7 * 86_400_000) },
          },
          orderBy: { weekStartDate: "asc" },
          select: { userId: true, hoursWorked: true },
        }),
  ]);
  const hoursByUser = new Map<string, number[]>();
  for (const r of rows) {
    hoursByUser.set(r.userId, [...(hoursByUser.get(r.userId) ?? []), r.hoursWorked]);
  }
  const fullTimeHoursPerWeek = Number(org?.fullTimeHoursPerWeek ?? 37.5);
  return new Map(
    members.map((m) => [
      m.id,
      describeFte({
        employmentType: m.employmentType,
        fteRatio: m.fteRatio,
        weeklyHours: hoursByUser.get(m.id) ?? [],
        fullTimeHoursPerWeek,
      }),
    ])
  );
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBradfordFactor, calculateEstimatedSspCost } from "@/lib/uk-compliance";
import { countWeekdays } from "@/lib/utils";

function absenceSpells(requests: { startDate: Date; endDate: Date }[]): number {
  if (requests.length === 0) return 0;
  const sorted = [...requests].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  let spells = 1;
  let activeEnd = sorted[0].endDate;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startDate > activeEnd) {
      spells += 1;
      activeEnd = sorted[i].endDate;
    } else if (sorted[i].endDate > activeEnd) {
      activeEnd = sorted[i].endDate;
    }
  }
  return spells;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department");
  const employmentType = searchParams.get("contractType");
  const threshold = Number(searchParams.get("bradfordThreshold") ?? 200);

  const userWhere: Record<string, unknown> = { organizationId: orgId, countryCode: "GB" };
  if (department) userWhere.department = department;
  if (employmentType) userWhere.employmentType = employmentType;

  const users = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      name: true,
      department: true,
      employmentType: true,
      leaveRequests: {
        where: {
          status: "APPROVED",
          endDate: { gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) },
        },
        include: { leaveType: { select: { name: true } } },
      },
    },
  });

  const holidayUsage = await Promise.all(
    users.map(async (user) => {
      const balances = await prisma.leaveRequest.findMany({
        where: {
          userId: user.id,
          status: "APPROVED",
          leaveType: { name: "Annual Leave" },
          startDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
          endDate: { lte: new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999) },
        },
        select: { startDate: true, endDate: true },
      });
      const taken = balances.reduce((sum, r) => sum + countWeekdays(r.startDate, r.endDate), 0);
      return {
        userId: user.id,
        name: user.name,
        department: user.department,
        contractType: user.employmentType,
        taken,
      };
    })
  );

  const bradfordReport = users.map((user) => {
    const sickness = user.leaveRequests.filter((r) => r.leaveType.name.includes("Sick") || r.leaveType.name.includes("SSP"));
    const spells = absenceSpells(sickness);
    const days = sickness.reduce((sum, r) => sum + countWeekdays(r.startDate, r.endDate), 0);
    const score = calculateBradfordFactor(spells, days);
    return {
      userId: user.id,
      name: user.name,
      spells,
      days,
      score,
      flagged: score >= threshold,
    };
  });

  const sspCurrent = users.flatMap((user) =>
    user.leaveRequests
      .filter((r) => r.leaveType.name.includes("SSP") && r.endDate >= new Date())
      .map((r) => ({
        userId: user.id,
        name: user.name,
        startDate: r.startDate,
        endDate: r.endDate,
        daysElapsed: countWeekdays(r.startDate, new Date()),
        estimatedCostToDate: calculateEstimatedSspCost(r.startDate, new Date()),
      }))
  );

  const today = new Date();
  const parental = users.flatMap((user) =>
    user.leaveRequests
      .filter(
        (r) =>
          [
            "Statutory Maternity Leave",
            "Statutory Paternity Leave",
            "Shared Parental Leave (SPL)",
            "Adoption Leave",
          ].includes(r.leaveType.name) && r.endDate >= today
      )
      .map((r) => {
        const cap = r.leaveType.name === "Shared Parental Leave (SPL)" ? 20 : 10;
        return {
          requestId: r.id,
          userId: user.id,
          name: user.name,
          leaveType: r.leaveType.name,
          startDate: r.startDate,
          expectedReturnDate: r.endDate,
          kitDaysUsed: r.kitDaysUsed,
          kitDaysCap: cap,
          kitDaysRemaining: Math.max(0, cap - r.kitDaysUsed),
        };
      })
  );

  const rightToWorkData = await prisma.user.findMany({
    where: { organizationId: orgId, countryCode: "GB" },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      rightToWorkVerified: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    holidayUsage,
    absenceTrigger: {
      threshold,
      rows: bradfordReport,
    },
    sspLiability: sspCurrent,
    parentalTracker: parental,
    rightToWork: rightToWorkData,
  });
}

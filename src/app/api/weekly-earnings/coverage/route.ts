import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Earnings-history coverage for each employee in the organization.
 *
 * Drives the amber warning on the Settings page — employees with no
 * weekly_earnings rows will have holiday pay calculated from basic salary
 * only, which is not UK-compliant for workers with regular overtime,
 * commission, or shift allowances.
 *
 * Returns a row per user (admin/manager only) with:
 *   - `paidWeeks`: count of non-zero-pay weeks on file
 *   - `totalWeeks`: count of all weekly_earnings rows (incl. zero-pay)
 *   - `lastWeekStartDate`: most recent week on file, or null
 */
export async function GET() {
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

  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      email: true,
      countryCode: true,
      department: true,
      employmentType: true,
      weeklyEarnings: {
        orderBy: { weekStartDate: "desc" },
        select: {
          weekStartDate: true,
          isZeroPayWeek: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = users.map((u) => {
    const totalWeeks = u.weeklyEarnings.length;
    const paidWeeks = u.weeklyEarnings.filter((w) => !w.isZeroPayWeek).length;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      countryCode: u.countryCode,
      department: u.department,
      employmentType: u.employmentType,
      totalWeeks,
      paidWeeks,
      lastWeekStartDate:
        u.weeklyEarnings[0]?.weekStartDate?.toISOString() ?? null,
      hasAnyHistory: totalWeeks > 0,
    };
  });

  return NextResponse.json({ employees: rows });
}

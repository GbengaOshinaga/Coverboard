import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateHolidayPayRate } from "@/lib/holidayPay";
import { z } from "zod";

const rowSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grossEarnings: z.number().min(0).max(1_000_000),
  hoursWorked: z.number().min(0).max(168),
  isZeroPayWeek: z.boolean(),
});

const bulkSchema = z.object({
  rows: z.array(rowSchema).min(1).max(260),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  const orgId = sessionUser.organizationId as string;

  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: memberId } = await params;

  const employee = await prisma.user.findFirst({
    where: { id: memberId, organizationId: orgId },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const body = await request.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Insert via upsert so retrying an import is idempotent for clean rows.
  // The frontend already de-duplicated against existing records, but we
  // use upsert here as a safety net.
  await Promise.all(
    parsed.data.rows.map((row) =>
      prisma.weeklyEarning.upsert({
        where: {
          userId_weekStartDate: {
            userId: memberId,
            weekStartDate: new Date(row.weekStartDate),
          },
        },
        create: {
          userId: memberId,
          weekStartDate: new Date(row.weekStartDate),
          grossEarnings: row.isZeroPayWeek ? 0 : row.grossEarnings,
          hoursWorked: row.isZeroPayWeek ? 0 : row.hoursWorked,
          isZeroPayWeek: row.isZeroPayWeek,
        },
        update: {
          grossEarnings: row.isZeroPayWeek ? 0 : row.grossEarnings,
          hoursWorked: row.isZeroPayWeek ? 0 : row.hoursWorked,
          isZeroPayWeek: row.isZeroPayWeek,
        },
      })
    )
  );

  // Return updated stats
  const entries = await prisma.weeklyEarning.findMany({
    where: { userId: memberId },
    orderBy: { weekStartDate: "asc" },
    take: 260,
  });
  const weeks = entries.map((e) => ({
    week_start_date: e.weekStartDate,
    gross_earnings: Number(e.grossEarnings),
    hours_worked: Number(e.hoursWorked),
    is_zero_pay_week: e.isZeroPayWeek,
  }));
  const averageDailyRate = entries.length > 0 ? calculateHolidayPayRate(weeks) : null;
  const paidWeeksCount = weeks.filter((w) => !w.is_zero_pay_week).length;

  return NextResponse.json(
    {
      imported: parsed.data.rows.length,
      entries,
      averageDailyRate,
      weeksOnRecord: entries.length,
      paidWeeksCount,
    },
    { status: 201 }
  );
}

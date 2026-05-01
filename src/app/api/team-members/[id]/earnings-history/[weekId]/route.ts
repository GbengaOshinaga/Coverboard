import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateHolidayPayRate } from "@/lib/holidayPay";
import {
  holidayPayNotApplicablePayload,
  isUkHolidayPayApplicable,
} from "@/lib/uk-holiday-pay";
import { z } from "zod";

async function getEarningsStats(userId: string) {
  const entries = await prisma.weeklyEarning.findMany({
    where: { userId },
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
  return { entries, averageDailyRate, weeksOnRecord: entries.length, paidWeeksCount };
}

const updateSchema = z.object({
  grossEarnings: z.number().min(0).max(1_000_000).optional(),
  hoursWorked: z.number().min(0).max(168).optional(),
  isZeroPayWeek: z.boolean().optional(),
});

function notApplicableResponse() {
  return NextResponse.json(holidayPayNotApplicablePayload(), { status: 403 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  const orgId = sessionUser.organizationId as string;

  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: memberId, weekId } = await params;

  // Verify employee belongs to org
  const employee = await prisma.user.findFirst({
    where: { id: memberId, organizationId: orgId },
    select: { id: true, workCountry: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!isUkHolidayPayApplicable(employee.workCountry)) return notApplicableResponse();

  // Verify entry belongs to this employee
  const entry = await prisma.weeklyEarning.findFirst({
    where: { id: weekId, userId: memberId },
  });
  if (!entry) return NextResponse.json({ error: "Earnings entry not found" }, { status: 404 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { grossEarnings, hoursWorked, isZeroPayWeek } = parsed.data;
  const zero = isZeroPayWeek ?? entry.isZeroPayWeek;

  await prisma.weeklyEarning.update({
    where: { id: weekId },
    data: {
      grossEarnings: zero ? 0 : (grossEarnings ?? Number(entry.grossEarnings)),
      hoursWorked: zero ? 0 : (hoursWorked ?? Number(entry.hoursWorked)),
      isZeroPayWeek: zero,
    },
  });

  const stats = await getEarningsStats(memberId);
  return NextResponse.json(stats);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  const orgId = sessionUser.organizationId as string;

  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: memberId, weekId } = await params;

  const employee = await prisma.user.findFirst({
    where: { id: memberId, organizationId: orgId },
    select: { id: true, workCountry: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!isUkHolidayPayApplicable(employee.workCountry)) return notApplicableResponse();

  const entry = await prisma.weeklyEarning.findFirst({
    where: { id: weekId, userId: memberId },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "Earnings entry not found" }, { status: 404 });

  await prisma.weeklyEarning.delete({ where: { id: weekId } });

  const stats = await getEarningsStats(memberId);
  return NextResponse.json(stats);
}

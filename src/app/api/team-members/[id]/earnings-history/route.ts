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

async function resolveEmployee(memberId: string, orgId: string) {
  return prisma.user.findFirst({
    where: { id: memberId, organizationId: orgId },
    select: { id: true, workCountry: true },
  });
}

function notApplicableResponse() {
  return NextResponse.json(holidayPayNotApplicablePayload(), { status: 403 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  const orgId = sessionUser.organizationId as string;
  const currentUserId = sessionUser.id as string;

  const { id: memberId } = await params;

  // Members can only read their own earnings; managers/admins can read anyone in org
  if (userRole === "MEMBER" && memberId !== currentUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employee = await resolveEmployee(memberId, orgId);
  if (!employee)
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!isUkHolidayPayApplicable(employee.workCountry)) return notApplicableResponse();

  const stats = await getEarningsStats(memberId);
  return NextResponse.json(stats);
}

const createSchema = z.object({
  weekStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .refine(
      (d) => new Date(`${d}T00:00:00.000Z`).getUTCDay() === 1,
      "week_starting must be a Monday"
    ),
  grossEarnings: z.number().min(0).max(1_000_000),
  hoursWorked: z.number().min(0).max(168),
  isZeroPayWeek: z.boolean().optional(),
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
  const employee = await resolveEmployee(memberId, orgId);
  if (!employee)
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!isUkHolidayPayApplicable(employee.workCountry)) return notApplicableResponse();

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { weekStartDate, grossEarnings, hoursWorked, isZeroPayWeek } = parsed.data;

  // Duplicate check — unlike the existing weekly-earnings upsert, this endpoint
  // treats duplicates as an error so the UI can surface it inline.
  const existing = await prisma.weeklyEarning.findUnique({
    where: { userId_weekStartDate: { userId: memberId, weekStartDate: new Date(weekStartDate) } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Earnings for this week already exist. Edit the existing record instead." },
      { status: 409 }
    );
  }

  await prisma.weeklyEarning.create({
    data: {
      userId: memberId,
      weekStartDate: new Date(weekStartDate),
      grossEarnings: isZeroPayWeek ? 0 : grossEarnings,
      hoursWorked: isZeroPayWeek ? 0 : hoursWorked,
      isZeroPayWeek: isZeroPayWeek ?? false,
    },
  });

  const stats = await getEarningsStats(memberId);
  return NextResponse.json(stats, { status: 201 });
}

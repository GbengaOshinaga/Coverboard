import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const countryCode = searchParams.get("country");
  const year = searchParams.get("year");
  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ukBankHolidayRegion: true },
  });

  const where: Record<string, unknown> = {
    organizationId: orgId,
  };

  if (countryCode) {
    where.countryCode = countryCode;
  }

  if (year) {
    const startOfYear = new Date(parseInt(year), 0, 1);
    const endOfYear = new Date(parseInt(year), 11, 31);
    where.date = {
      gte: startOfYear,
      lte: endOfYear,
    };
  }

  const holidays = await prisma.publicHoliday.findMany({
    where,
    orderBy: { date: "asc" },
  });

  const bankHolidayWhere: Record<string, unknown> = {
    organizationId: orgId,
    region: org?.ukBankHolidayRegion ?? "ENGLAND_WALES",
  };
  if (year) {
    const startOfYear = new Date(parseInt(year), 0, 1);
    const endOfYear = new Date(parseInt(year), 11, 31);
    bankHolidayWhere.date = {
      gte: startOfYear,
      lte: endOfYear,
    };
  }

  const ukBankHolidays = await prisma.bankHoliday.findMany({
    where: bankHolidayWhere,
    orderBy: { date: "asc" },
  });

  return NextResponse.json([
    ...holidays,
    ...ukBankHolidays,
  ]);
}

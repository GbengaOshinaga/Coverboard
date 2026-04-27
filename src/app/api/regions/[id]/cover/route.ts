import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { parseISO, isValid } from "date-fns";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeDailyCover } from "@/lib/regionCover";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const { id } = await params;
  const url = new URL(request.url);
  const dateStr = url.searchParams.get("date");
  if (!dateStr) {
    return NextResponse.json({ error: "Missing date param (YYYY-MM-DD)" }, { status: 400 });
  }
  const date = parseISO(dateStr);
  if (!isValid(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const region = await prisma.region.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, name: true, color: true, minCover: true, isActive: true },
  });
  if (!region) return NextResponse.json({ error: "Region not found" }, { status: 404 });

  const days = await computeDailyCover({
    organizationId: orgId,
    regionId: region.id,
    start: date,
    end: date,
  });
  const day = days[0];
  if (!day) {
    return NextResponse.json({
      date: dateStr,
      available: 0,
      required: region.minCover,
      staffOff: [],
      staffAvailable: [],
      isWeekend: false,
      isBankHoliday: false,
      region,
    });
  }
  return NextResponse.json({ ...day, region });
}

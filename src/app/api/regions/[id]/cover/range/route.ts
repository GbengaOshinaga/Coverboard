import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { parseISO, isValid, differenceInDays } from "date-fns";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeDailyCover } from "@/lib/regionCover";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";

const MAX_RANGE_DAYS = 366;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const { id } = await params;
  const url = new URL(request.url);
  const startStr = url.searchParams.get("start");
  const endStr = url.searchParams.get("end");
  if (!startStr || !endStr) {
    return NextResponse.json({ error: "Missing start or end (YYYY-MM-DD)" }, { status: 400 });
  }
  const start = parseISO(startStr);
  const end = parseISO(endStr);
  if (!isValid(start) || !isValid(end)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (end.getTime() < start.getTime()) {
    return NextResponse.json({ error: "end must be >= start" }, { status: 400 });
  }
  if (differenceInDays(end, start) > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "Range exceeds 366 days" }, { status: 400 });
  }

  const region = await prisma.region.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, name: true, color: true, minCover: true, isActive: true },
  });
  if (!region) return NextResponse.json({ error: "Region not found" }, { status: 404 });

  const days = await computeDailyCover({
    organizationId: orgId,
    regionId: region.id,
    start,
    end,
  });

  return NextResponse.json({ region, days });
}

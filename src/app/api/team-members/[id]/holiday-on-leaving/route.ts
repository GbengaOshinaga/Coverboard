import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHolidayOnLeaving } from "@/lib/holiday-on-leaving-server";

/**
 * Holiday on leaving for someone with a leaving date: built up, taken,
 * carried over and owed (pay in lieu), for admins and managers in their team
 * (src/lib/holiday-on-leaving.ts).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as Record<string, unknown>;
  if (u.role !== "ADMIN" && u.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const member = await prisma.user.findFirst({
    where: { id, organizationId: u.organizationId as string },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  const report = await getHolidayOnLeaving(id);
  if (!report) return NextResponse.json({ error: "No leaving date recorded" }, { status: 404 });
  return NextResponse.json(report);
}

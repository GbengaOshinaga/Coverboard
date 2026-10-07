import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ukToday } from "@/lib/workPattern";
import { leavingDateError, previewLeaving } from "@/lib/leavers";

/**
 * What a leaving date would cancel or cut short, before an admin saves it
 * (src/lib/leavers.ts). Read-only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as Record<string, unknown>;
  if (u.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const member = await prisma.user.findFirst({
    where: { id, organizationId: u.organizationId as string },
    select: { serviceStartDate: true },
  });
  if (!member) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  const lastDay = new URL(request.url).searchParams.get("lastDay") ?? "";
  const today = ukToday();
  const problem = leavingDateError({ lastDay, today, serviceStartDate: member.serviceStartDate });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  return NextResponse.json({ ...(await previewLeaving({ userId: id, lastDay })), inPast: lastDay < today });
}

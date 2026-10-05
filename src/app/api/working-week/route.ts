import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkingWeek } from "@/lib/working-week-server";

/**
 * Someone's working week (src/lib/working-week-server.ts), so the booking
 * form counts the days they'd actually have worked, as balances do.
 * Yourself, or (admins and managers) someone on your team.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as Record<string, unknown>;
  const target = new URL(request.url).searchParams.get("userId") ?? (u.id as string);
  if (target !== u.id) {
    if (u.role !== "ADMIN" && u.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const member = await prisma.user.findFirst({
      where: { id: target, organizationId: u.organizationId as string },
      select: { id: true },
    });
    if (!member) return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }
  return NextResponse.json(await getWorkingWeek(target));
}

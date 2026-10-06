import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { leaveYearForOrg } from "@/lib/leave-year-server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserLeaveBalances } from "@/lib/leave-balances";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId");
  const year = searchParams.get("year");

  const sessionUser = session.user as Record<string, unknown>;
  const currentUserId = sessionUser.id as string;
  const userRole = sessionUser.role as string;

  if (targetUserId && targetUserId !== currentUserId && userRole === "MEMBER") {
    return NextResponse.json(
      { error: "You can only view your own leave balances" },
      { status: 403 }
    );
  }

  const userId = targetUserId ?? currentUserId;
  // Only people in your own team.
  if (targetUserId && targetUserId !== currentUserId) {
    const member = await prisma.user.findFirst({
      where: { id: targetUserId, organizationId: sessionUser.organizationId as string },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
  }
  // A leave year (the year it starts in); the team's current one by default.
  const balanceYear = year ? parseInt(year) : await leaveYearForOrg(sessionUser.organizationId as string);

  try {
    const balances = await getUserLeaveBalances(userId, balanceYear);
    return NextResponse.json(balances);
  } catch (error) {
    console.error("Leave balance error:", error);
    return NextResponse.json(
      { error: "Failed to calculate balances" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
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

  const currentUserId = (session.user as Record<string, unknown>).id as string;
  const userId = targetUserId ?? currentUserId;
  const balanceYear = year ? parseInt(year) : new Date().getFullYear();

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

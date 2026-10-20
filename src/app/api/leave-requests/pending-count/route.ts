import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * How many requests are waiting for this person to approve, for the badge on
 * Requests in the sidebar. Admins and managers only; their own requests don't
 * count (they can't approve those), nor do people who've left.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as Record<string, unknown>;
  if (u.role !== "ADMIN" && u.role !== "MANAGER") return NextResponse.json({ count: 0 });

  const count = await prisma.leaveRequest.count({
    where: {
      status: "PENDING",
      userId: { not: u.id as string },
      user: { organizationId: u.organizationId as string, isActive: true },
    },
  });
  return NextResponse.json({ count });
}

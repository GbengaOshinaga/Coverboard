import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leaveTypeSeenBy } from "@/lib/leave-privacy";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const excludeUserId = searchParams.get("excludeUser");

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to parameters are required" },
      { status: 400 }
    );
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const startDate = new Date(from);
  const endDate = new Date(to);

  // Find overlapping approved or pending leave requests
  const overlapping = await prisma.leaveRequest.findMany({
    where: {
      user: {
        organizationId: orgId,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    // Only what the warning shows. Any signed-in member can call this, so
    // never whole rows (sickness notes, pay and earnings live on them).
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
      user: {
        select: {
          id: true,
          name: true,
          memberType: true,
        },
      },
      leaveType: {
        select: {
          name: true,
          color: true,
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  const teamCount = await prisma.user.count({
    where: { organizationId: orgId },
  });

  const uniqueUsersOut = new Set(overlapping.map((r) => r.user.id)).size;
  const coverageRatio = teamCount > 0 ? (teamCount - uniqueUsersOut) / teamCount : 1;

  // Staff see who's off, not why.
  const viewer = session.user as Record<string, unknown>;
  return NextResponse.json({
    overlapping: overlapping.map((r) => ({ ...r, leaveType: leaveTypeSeenBy(r.leaveType, { id: viewer.id, role: viewer.role }, r.user.id) })),
    teamCount,
    uniqueUsersOut,
    coverageRatio,
    isHighOverlap: coverageRatio < 0.5,
  });
}

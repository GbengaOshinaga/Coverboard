import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leaveTypeSeenBy } from "@/lib/leave-privacy";

/**
 * Approved leave between two dates for the team calendar, plus the viewer's
 * own requests still waiting for approval (marked pending): who, when and the
 * type as this viewer may see it. Staff see colleagues as "Away"
 * (src/lib/leave-privacy.ts); admins and managers, and everyone for their own
 * leave, see the type. Nothing else (notes, fit notes, emails) is sent.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const viewer = session.user as Record<string, unknown>;

  const { searchParams } = new URL(request.url);
  const from = new Date(searchParams.get("from") ?? "");
  const to = new Date(searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return NextResponse.json({ error: "from and to dates are needed" }, { status: 400 });
  }
  // At most a few months on screen; refuse anything wider.
  if (to.getTime() - from.getTime() > 120 * 86_400_000) {
    return NextResponse.json({ error: "Range too long" }, { status: 400 });
  }

  const rows = await prisma.leaveRequest.findMany({
    where: {
      user: { organizationId: viewer.organizationId as string },
      OR: [{ status: "APPROVED" }, { status: "PENDING", userId: viewer.id as string }],
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      user: { select: { id: true, name: true, regionId: true } },
      leaveType: { select: { name: true, color: true } },
    },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      pending: r.status === "PENDING",
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      user: r.user,
      leaveType: leaveTypeSeenBy(r.leaveType, { id: viewer.id, role: viewer.role }, r.user.id),
    }))
  );
}

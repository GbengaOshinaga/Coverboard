import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { format } from "date-fns";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRegionalCover } from "@/lib/regionCover";

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const myId = sessionUser.id as string;
  const myRole = sessionUser.role as string;

  const { id } = await params;
  const leaveRequest = await prisma.leaveRequest.findFirst({
    where: { id, user: { organizationId: orgId } },
    select: {
      id: true,
      userId: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!leaveRequest) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }

  // Anyone in the org can check cover for their own request; admins/managers
  // can check for anyone.
  if (leaveRequest.userId !== myId && !isAdminOrManager(myRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await checkRegionalCover({
    organizationId: orgId,
    userId: leaveRequest.userId,
    startDate: format(leaveRequest.startDate, "yyyy-MM-dd"),
    endDate: format(leaveRequest.endDate, "yyyy-MM-dd"),
    excludeRequestId: leaveRequest.id,
  });

  return NextResponse.json(result);
}

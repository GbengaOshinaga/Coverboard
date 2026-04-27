import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

export async function GET(
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

  if (id !== myId && !isAdminOrManager(myRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const member = await prisma.user.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const history = await prisma.userRegionHistory.findMany({
    where: { userId: id },
    orderBy: { changedAt: "desc" },
    take: 50,
    select: {
      id: true,
      regionId: true,
      notes: true,
      changedAt: true,
      region: { select: { id: true, name: true, color: true } },
      changedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(history);
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

const updateSchema = z.object({
  regionId: z.string().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

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
    select: {
      id: true,
      name: true,
      regionId: true,
      region: {
        select: { id: true, name: true, color: true, minCover: true, isActive: true },
      },
    },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  return NextResponse.json(member);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionUser = session.user as Record<string, unknown>;
  if (!isAdminOrManager(sessionUser.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  const actorId = sessionUser.id as string;
  const { id } = await params;

  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const member = await prisma.user.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, regionId: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  if (parsed.data.regionId) {
    const region = await prisma.region.findFirst({
      where: { id: parsed.data.regionId, organizationId: orgId },
      select: { id: true, isActive: true },
    });
    if (!region) {
      return NextResponse.json({ error: "Region not found" }, { status: 404 });
    }
    if (!region.isActive) {
      return NextResponse.json(
        { error: "Cannot assign to an inactive region" },
        { status: 400 }
      );
    }
  }

  if (member.regionId === parsed.data.regionId) {
    return NextResponse.json({ id: member.id, regionId: member.regionId, unchanged: true });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { regionId: parsed.data.regionId },
    }),
    prisma.userRegionHistory.create({
      data: {
        userId: id,
        regionId: parsed.data.regionId,
        changedById: actorId,
        notes: parsed.data.notes ?? null,
      },
    }),
  ]);

  const updated = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      regionId: true,
      region: {
        select: { id: true, name: true, color: true, minCover: true, isActive: true },
      },
    },
  });
  return NextResponse.json(updated);
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidHexColor } from "@/lib/regionCover";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";
import { recordAudit, requestAuditContext } from "@/lib/audit";

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    minCover: z.number().int().min(1).max(1000).optional(),
    color: z
      .string()
      .trim()
      .refine((v) => v === "" || isValidHexColor(v), "Invalid hex colour")
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

async function loadOwnedRegion(regionId: string, orgId: string) {
  return prisma.region.findFirst({
    where: { id: regionId, organizationId: orgId },
  });
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

  const { id } = await params;
  const orgId = sessionUser.organizationId as string;
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();
  const region = await loadOwnedRegion(id, orgId);
  if (!region) return NextResponse.json({ error: "Region not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  if (parsed.data.name && parsed.data.name !== region.name) {
    const conflict = await prisma.region.findFirst({
      where: { organizationId: orgId, name: parsed.data.name, NOT: { id } },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "A region with this name already exists" },
        { status: 409 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.minCover !== undefined) data.minCover = parsed.data.minCover;
  if (parsed.data.color !== undefined) {
    data.color = parsed.data.color === "" ? null : parsed.data.color;
  }
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  const updated = await prisma.region.update({ where: { id }, data });

  await recordAudit({
    organizationId: orgId,
    action: "organization.settings_updated",
    resource: "organization",
    resourceId: orgId,
    actor: {
      id: sessionUser.id as string,
      email: (sessionUser.email as string) ?? null,
      role: sessionUser.role as string,
    },
    metadata: { event: "region.updated", regionId: id, changes: parsed.data },
    context: requestAuditContext(request),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  if (!isAdminOrManager(sessionUser.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const orgId = sessionUser.organizationId as string;
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();
  const region = await loadOwnedRegion(id, orgId);
  if (!region) return NextResponse.json({ error: "Region not found" }, { status: 404 });

  const actorId = sessionUser.id as string;

  const affected = await prisma.user.findMany({
    where: { regionId: id, organizationId: orgId },
    select: { id: true },
  });

  await prisma.$transaction([
    ...affected.map((u) =>
      prisma.userRegionHistory.create({
        data: {
          userId: u.id,
          regionId: null,
          changedById: actorId,
          notes: `Region '${region.name}' deleted`,
        },
      })
    ),
    prisma.user.updateMany({
      where: { regionId: id, organizationId: orgId },
      data: { regionId: null },
    }),
    prisma.region.delete({ where: { id } }),
  ]);

  await recordAudit({
    organizationId: orgId,
    action: "organization.settings_updated",
    resource: "organization",
    resourceId: orgId,
    actor: {
      id: actorId,
      email: (sessionUser.email as string) ?? null,
      role: sessionUser.role as string,
    },
    metadata: {
      event: "region.deleted",
      regionId: id,
      regionName: region.name,
      affectedMembers: affected.length,
    },
    context: requestAuditContext(request),
  });

  return NextResponse.json({ success: true, unassignedMembers: affected.length });
}

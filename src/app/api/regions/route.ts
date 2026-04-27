import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidHexColor, pickPresetColor } from "@/lib/regionCover";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";
import { recordAudit, requestAuditContext } from "@/lib/audit";

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  minCover: z.number().int().min(1).max(1000).default(1),
  color: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidHexColor(v), "Invalid hex colour")
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const regions = await prisma.region.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      minCover: true,
      color: true,
      isActive: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });

  return NextResponse.json(
    regions.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      minCover: r.minCover,
      color: r.color,
      isActive: r.isActive,
      createdAt: r.createdAt,
      memberCount: r._count.members,
    }))
  );
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  if (!isAdminOrManager(sessionUser.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();
  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.region.findFirst({
    where: { organizationId: orgId, name: parsed.data.name },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A region with this name already exists" },
      { status: 409 }
    );
  }

  const existingCount = await prisma.region.count({ where: { organizationId: orgId } });
  const color =
    parsed.data.color && parsed.data.color !== ""
      ? parsed.data.color
      : pickPresetColor(existingCount);

  const region = await prisma.region.create({
    data: {
      organizationId: orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      minCover: parsed.data.minCover,
      color,
      isActive: parsed.data.isActive ?? true,
    },
  });

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
    metadata: { event: "region.created", regionId: region.id, name: region.name },
    context: requestAuditContext(request),
  });

  return NextResponse.json(region, { status: 201 });
}

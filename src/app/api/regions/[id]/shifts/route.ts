import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { shiftTypeCreateSchema } from "@/lib/shiftTypeSchema";

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

const SHIFT_SELECT = {
  id: true,
  name: true,
  startTime: true,
  endTime: true,
  minCoverByWeekday: true,
  sortOrder: true,
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const { id } = await params;
  const region = await prisma.region.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!region) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const shifts = await prisma.shiftType.findMany({
    where: { regionId: id },
    orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }],
    select: {
      ...SHIFT_SELECT,
      _count: { select: { patterns: { where: { effectiveTo: null } } } },
    },
  });
  return NextResponse.json(
    shifts.map(({ _count, ...s }) => ({ ...s, patternCount: _count.patterns }))
  );
}

export async function POST(
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
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const { id } = await params;
  const region = await prisma.region.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!region) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = shiftTypeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const duplicate = await prisma.shiftType.findFirst({
    where: { regionId: id, name: parsed.data.name },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "This location already has a shift with that name" },
      { status: 409 }
    );
  }

  const shift = await prisma.shiftType.create({
    data: { ...parsed.data, regionId: id },
    select: SHIFT_SELECT,
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
    metadata: { event: "shift_type.created", regionId: id, shiftTypeId: shift.id, name: shift.name },
    context: requestAuditContext(request),
  });

  return NextResponse.json(shift, { status: 201 });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { shiftTypeUpdateSchema } from "@/lib/shiftTypeSchema";

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

type RouteParams = { params: Promise<{ id: string; shiftId: string }> };

type AuthResult =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      sessionUser: Record<string, unknown>;
      orgId: string;
      shift: NonNullable<Awaited<ReturnType<typeof prisma.shiftType.findFirst>>>;
    };

async function authorise(params: RouteParams["params"]): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const sessionUser = session.user as Record<string, unknown>;
  if (!isAdminOrManager(sessionUser.role as string)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const orgId = sessionUser.organizationId as string;
  if (!(await isRegionsEnabled(orgId))) return { ok: false, response: regionsDisabledResponse() };

  const { id, shiftId } = await params;
  const shift = await prisma.shiftType.findFirst({
    where: { id: shiftId, regionId: id, region: { organizationId: orgId } },
  });
  if (!shift) {
    return { ok: false, response: NextResponse.json({ error: "Shift not found" }, { status: 404 }) };
  }
  return { ok: true, sessionUser, orgId, shift };
}

function actorOf(sessionUser: Record<string, unknown>) {
  return {
    id: sessionUser.id as string,
    email: (sessionUser.email as string) ?? null,
    role: sessionUser.role as string,
  };
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await authorise(params);
  if (!auth.ok) return auth.response;
  const { sessionUser, orgId, shift } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = shiftTypeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const startTime = parsed.data.startTime ?? shift.startTime;
  const endTime = parsed.data.endTime ?? shift.endTime;
  if (startTime === endTime) {
    return NextResponse.json(
      { error: "Start and end times can't be the same" },
      { status: 400 }
    );
  }

  if (parsed.data.name && parsed.data.name !== shift.name) {
    const duplicate = await prisma.shiftType.findFirst({
      where: { regionId: shift.regionId, name: parsed.data.name, NOT: { id: shift.id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "This region already has a shift with that name" },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.shiftType.update({
    where: { id: shift.id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
      minCoverByWeekday: true,
      sortOrder: true,
    },
  });

  await recordAudit({
    organizationId: orgId,
    action: "organization.settings_updated",
    resource: "organization",
    resourceId: orgId,
    actor: actorOf(sessionUser),
    metadata: {
      event: "shift_type.updated",
      regionId: shift.regionId,
      shiftTypeId: shift.id,
      changes: parsed.data,
    },
    context: requestAuditContext(request),
  });

  return NextResponse.json(updated);
}

/**
 * Deletes the shift type and every working-pattern row that references it
 * (cascade). Cover history for that shift stops appearing in reports.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await authorise(params);
  if (!auth.ok) return auth.response;
  const { sessionUser, orgId, shift } = auth;

  await prisma.shiftType.delete({ where: { id: shift.id } });

  await recordAudit({
    organizationId: orgId,
    action: "organization.settings_updated",
    resource: "organization",
    resourceId: orgId,
    actor: actorOf(sessionUser),
    metadata: {
      event: "shift_type.deleted",
      regionId: shift.regionId,
      shiftTypeId: shift.id,
      name: shift.name,
    },
    context: requestAuditContext(request),
  });

  return NextResponse.json({ ok: true });
}

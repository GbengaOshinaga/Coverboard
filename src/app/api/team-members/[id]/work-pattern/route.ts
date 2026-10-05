import { NextResponse } from "next/server";
import { syncDaysFromPattern } from "@/lib/working-week-server";
import { recomputeCurrentSspSpells } from "@/lib/leave-requests/ssp-spell";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRegionsEnabled, regionsDisabledResponse } from "@/lib/regionsFeature";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { workPatternSchema } from "@/lib/shiftTypeSchema";
import { dbDate, endWorkPatternOps, ukToday } from "@/lib/workPattern";

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

function currentPatternWhere(userId: string, today: Date) {
  return {
    userId,
    effectiveFrom: { lte: today },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
  };
}

async function loadMember(id: string, orgId: string) {
  return prisma.user.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      name: true,
      region: {
        select: {
          id: true,
          name: true,
          shiftTypes: {
            orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }],
            select: { id: true, name: true, startTime: true, endTime: true },
          },
        },
      },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const { id } = await params;

  if (id !== sessionUser.id && !isAdminOrManager(sessionUser.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const member = await loadMember(id, orgId);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const shiftIds = member.region?.shiftTypes.map((s) => s.id) ?? [];
  const entries =
    shiftIds.length === 0
      ? []
      : await prisma.workPattern.findMany({
          where: {
            ...currentPatternWhere(id, dbDate(ukToday())),
            shiftTypeId: { in: shiftIds },
          },
          select: { shiftTypeId: true, weekday: true },
        });

  return NextResponse.json({
    region: member.region
      ? { id: member.region.id, name: member.region.name }
      : null,
    shifts: member.region?.shiftTypes ?? [],
    entries,
  });
}

/**
 * Replaces the member's working pattern from today. Rows already in effect are
 * closed yesterday (kept for history); rows that haven't started yet are
 * deleted; the new pattern starts today.
 */
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
  if (!(await isRegionsEnabled(orgId))) return regionsDisabledResponse();

  const { id } = await params;
  const member = await loadMember(id, orgId);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (!member.region) {
    return NextResponse.json(
      { error: "Assign this member to a location before setting a working pattern" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = workPatternSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const allowed = new Set(member.region.shiftTypes.map((s) => s.id));
  const unique = new Map<string, { shiftTypeId: string; weekday: number }>();
  for (const e of parsed.data.entries) {
    if (!allowed.has(e.shiftTypeId)) {
      return NextResponse.json(
        { error: "Shifts must belong to the member's location" },
        { status: 400 }
      );
    }
    unique.set(`${e.shiftTypeId}:${e.weekday}`, e);
  }
  const entries = [...unique.values()];

  const todayIso = ukToday();
  const today = dbDate(todayIso);

  await prisma.$transaction([
    ...endWorkPatternOps(id, today),
    prisma.workPattern.createMany({
      data: entries.map((e) => ({
        userId: id,
        shiftTypeId: e.shiftTypeId,
        weekday: e.weekday,
        effectiveFrom: today,
      })),
    }),
  ]);

  // Holiday pay, entitlement and SSP read the stored day counts in places;
  // keep them matching the days this pattern actually works.
  await syncDaysFromPattern(id);
  // SSP for sickness still going on or still to come is paid on the days they
  // now work.
  await recomputeCurrentSspSpells(id);

  await recordAudit({
    organizationId: orgId,
    action: "team_member.updated",
    resource: "team_member",
    resourceId: id,
    actor: {
      id: sessionUser.id as string,
      email: (sessionUser.email as string) ?? null,
      role: sessionUser.role as string,
    },
    metadata: { event: "work_pattern.updated", effectiveFrom: todayIso, entries },
    context: requestAuditContext(request),
  });

  return NextResponse.json({ entries, effectiveFrom: todayIso });
}

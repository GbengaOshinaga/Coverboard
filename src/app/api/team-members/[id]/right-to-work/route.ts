import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeatureForEnum } from "@/lib/planFeatures";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { syncRightToWorkFromChecks } from "@/lib/right-to-work-server";
import type { AnyPlan } from "@/lib/plans";

const day = z.string().date();

const checkSchema = z
  .object({
    checkedOn: day,
    method: z.enum(["ONLINE_SHARE_CODE", "MANUAL_DOCUMENTS", "IDENTITY_SERVICE_PROVIDER"]),
    documentType: z.string().trim().max(120).optional().nullable(),
    hasRightToWork: z.boolean(),
    /** Time-limited permission ends; omit for no time limit. */
    expiresOn: day.optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine((c) => new Date(`${c.checkedOn}T00:00:00Z`) <= new Date(), {
    message: "The check date can't be in the future",
  })
  .refine((c) => !c.expiresOn || c.hasRightToWork, {
    message: "Only add an expiry date when they have the right to work",
  })
  .refine((c) => !c.expiresOn || c.expiresOn >= c.checkedOn, {
    message: "Permission can't expire before the check date",
  });

/**
 * Right-to-work checks for a team member: their history, and recording a new
 * check (admins and managers, Growth plan and above). Immigration status is
 * sensitive, so the person's own colleagues can't read it.
 */
async function access(memberId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const u = session.user as Record<string, unknown>;
  const role = u.role as string;
  if (role !== "ADMIN" && role !== "MANAGER") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!hasFeatureForEnum((u.plan as AnyPlan | undefined) ?? null, "right_to_work")) {
    return {
      error: NextResponse.json(
        { error: "Right-to-work checks are available on the Growth plan." },
        { status: 403 }
      ),
    };
  }
  const member = await prisma.user.findFirst({
    where: { id: memberId, organizationId: u.organizationId as string },
    select: { id: true },
  });
  if (!member) return { error: NextResponse.json({ error: "Member not found" }, { status: 404 }) };
  return {
    orgId: u.organizationId as string,
    actor: { id: u.id as string, email: (u.email as string) ?? null, role },
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(id);
  if ("error" in a) return a.error;
  const checks = await prisma.rightToWorkCheck.findMany({
    where: { userId: id },
    orderBy: [{ checkedOn: "desc" }, { createdAt: "desc" }],
  });
  const checkers = await prisma.user.findMany({
    where: { id: { in: checks.map((c) => c.checkedById).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  return NextResponse.json(
    checks.map((c) => ({
      id: c.id,
      checkedOn: c.checkedOn.toISOString().slice(0, 10),
      method: c.method,
      documentType: c.documentType,
      hasRightToWork: c.hasRightToWork,
      expiresOn: c.expiresOn ? c.expiresOn.toISOString().slice(0, 10) : null,
      notes: c.notes,
      checkedBy: checkers.find((x) => x.id === c.checkedById)?.name ?? null,
    }))
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(id);
  if ("error" in a) return a.error;

  const parsed = checkSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const c = parsed.data;
  const check = await prisma.rightToWorkCheck.create({
    data: {
      userId: id,
      checkedOn: new Date(`${c.checkedOn}T00:00:00Z`),
      method: c.method,
      documentType: c.documentType || null,
      hasRightToWork: c.hasRightToWork,
      expiresOn: c.expiresOn ? new Date(`${c.expiresOn}T00:00:00Z`) : null,
      notes: c.notes || null,
      checkedById: a.actor.id,
    },
    select: { id: true },
  });
  await syncRightToWorkFromChecks(id);

  await recordAudit({
    organizationId: a.orgId,
    action: "team_member.updated",
    resource: "team_member",
    resourceId: id,
    actor: a.actor,
    metadata: {
      event: "right_to_work.checked",
      checkId: check.id,
      checkedOn: c.checkedOn,
      method: c.method,
      hasRightToWork: c.hasRightToWork,
      expiresOn: c.expiresOn ?? null,
    },
    context: requestAuditContext(request),
  });
  return NextResponse.json({ id: check.id }, { status: 201 });
}

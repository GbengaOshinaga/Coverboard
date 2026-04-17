import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  leaveTypeId: z.string().min(1),
  countryCode: z.string().length(2).toUpperCase(),
  annualAllowance: z.number().int().min(0).max(365),
  carryOverMax: z.number().int().min(0).max(365).default(0),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  const { searchParams } = new URL(request.url);
  const leaveTypeId = searchParams.get("leaveTypeId");

  const where: { leaveType: { organizationId: string }; leaveTypeId?: string } = {
    leaveType: { organizationId: orgId },
  };
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;

  const policies = await prisma.leavePolicy.findMany({
    where,
    include: {
      leaveType: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ countryCode: "asc" }, { leaveType: { name: "asc" } }],
  });

  return NextResponse.json(policies);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const orgId = sessionUser.organizationId as string;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Ensure the leave type belongs to this org
  const leaveType = await prisma.leaveType.findFirst({
    where: { id: parsed.data.leaveTypeId, organizationId: orgId },
    select: { id: true },
  });
  if (!leaveType) {
    return NextResponse.json(
      { error: "Leave type not found in your organization" },
      { status: 404 }
    );
  }

  try {
    const policy = await prisma.leavePolicy.create({
      data: parsed.data,
      include: {
        leaveType: { select: { id: true, name: true, color: true } },
      },
    });

    recordAudit({
      organizationId: orgId,
      action: "leave_policy.created",
      resource: "leave_policy",
      resourceId: policy.id,
      actor: {
        id: sessionUser.id as string,
        email: session.user.email ?? null,
        role: sessionUser.role as string,
      },
      metadata: {
        leaveType: policy.leaveType.name,
        countryCode: policy.countryCode,
        annualAllowance: policy.annualAllowance,
        carryOverMax: policy.carryOverMax,
      },
      context: requestAuditContext(request),
    });

    return NextResponse.json(policy, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        error:
          "A policy already exists for this leave type and country. Edit it instead.",
      },
      { status: 409 }
    );
  }
}

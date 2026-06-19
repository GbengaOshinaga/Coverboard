import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leaveTypeSchema } from "@/lib/validations";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { hasFeatureForEnum } from "@/lib/planFeatures";
import type { AnyPlan } from "@/lib/plans";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(leaveTypes);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Creating custom leave types is a Scale-tier feature. Lower tiers can
  // still edit the seeded defaults (annual leave, SSP, etc) via PATCH —
  // only NEW types are gated.
  const plan = sessionUser.plan as AnyPlan | undefined;
  if (!hasFeatureForEnum(plan ?? null, "custom_leave_types")) {
    return NextResponse.json(
      {
        error:
          "Custom leave types are a Scale-tier feature. Upgrade your plan to create your own.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = leaveTypeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const orgId = sessionUser.organizationId as string;

    const leaveType = await prisma.leaveType.create({
      data: {
        ...parsed.data,
        // Zod's .nullable().optional().toUpperCase() can leave us with an
        // empty string or undefined; normalise to null for the DB.
        countryCode: parsed.data.countryCode || null,
        organizationId: orgId,
      },
    });

    recordAudit({
      organizationId: orgId,
      action: "leave_type.created",
      resource: "leave_type",
      resourceId: leaveType.id,
      actor: {
        id: (session.user as Record<string, unknown>).id as string,
        email: session.user.email ?? null,
        role: userRole,
      },
      metadata: {
        name: leaveType.name,
        defaultDays: leaveType.defaultDays,
        isPaid: leaveType.isPaid,
      },
      context: requestAuditContext(request),
    });

    return NextResponse.json(leaveType, { status: 201 });
  } catch (error) {
    console.error("Create leave type error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leaveTypeSchema } from "@/lib/validations";
import { recordAudit, requestAuditContext } from "@/lib/audit";

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

  const userRole = (session.user as Record<string, unknown>).role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const orgId = (session.user as Record<string, unknown>).organizationId as string;

    const leaveType = await prisma.leaveType.create({
      data: {
        ...parsed.data,
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

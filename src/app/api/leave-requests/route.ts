import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  recordReadAudit,
  requestAuditContext,
  selectSicknessAuditMeta,
} from "@/lib/audit";
import type { AnyPlan } from "@/lib/plans";
import { createLeaveRequest } from "@/lib/leave-requests/create";
import { z } from "zod";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const userId = searchParams.get("userId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const currentUserId = sessionUser.id as string;
  const userRole = sessionUser.role as string;

  const where: Record<string, unknown> = {
    user: { organizationId: orgId },
  };

  if (userRole === "MEMBER") {
    where.userId = currentUserId;
  } else if (userId) {
    where.userId = userId;
  }

  if (status) {
    where.status = status;
  }
  if (from || to) {
    where.endDate = from ? { gte: new Date(from) } : undefined;
    where.startDate = to ? { lte: new Date(to) } : undefined;
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          countryCode: true,
          memberType: true,
          regionId: true,
        },
      },
      leaveType: {
        select: { id: true, name: true, color: true },
      },
      reviewedBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Sickness notes are sensitive medical data: only the request's owner and
  // admins (the org's data controllers) receive the free text. Managers and
  // other viewers get it redacted — they still see leave type, dates and the
  // evidenceProvided flag.
  const visibleRequests = requests.map((r) =>
    r.userId === currentUserId || userRole === "ADMIN"
      ? r
      : { ...r, sicknessNote: null }
  );

  // Pro-only read-side audit, computed on the redacted set so managers (who no
  // longer receive notes) don't generate spurious "sickness_viewed" entries.
  const sicknessMeta = selectSicknessAuditMeta(
    visibleRequests,
    currentUserId,
    userRole
  );
  if (sicknessMeta) {
    void recordReadAudit({
      plan: sessionUser.plan as AnyPlan | undefined,
      organizationId: orgId,
      action: "leave_request.sickness_viewed",
      resource: "leave_request",
      actor: {
        id: currentUserId,
        email: (session.user.email as string | null) ?? null,
        role: userRole,
      },
      metadata: sicknessMeta,
      context: requestAuditContext(request),
    });
  }

  return NextResponse.json(visibleRequests);
}

const createSchema = z.object({
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  leaveTypeId: z.string(),
  note: z.string().optional(),
  sicknessNote: z.string().optional(),
  evidenceProvided: z.boolean().optional(),
  kitDaysUsed: z.number().int().min(0).optional(),
  splitDaysUsed: z.number().int().min(0).optional(),
  hoursBooked: z.number().min(0).optional(),
  childBirthDate: z.string().transform((s) => new Date(s)).optional(),
  expectedDueDate: z.string().transform((s) => new Date(s)).optional(),
  splCurtailmentConfirmed: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const sessionUser = session.user as Record<string, unknown>;
    const result = await createLeaveRequest({
      actor: {
        id: sessionUser.id as string,
        email: (session.user.email as string | null) ?? null,
        role: sessionUser.role as string,
        plan: sessionUser.plan as string | undefined,
      },
      organizationId: sessionUser.organizationId as string,
      ...parsed.data,
      context: requestAuditContext(request),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        ...result.request,
        balanceWarning: result.balanceWarning,
        sspInfo: result.sspInfo,
        firstRequest: result.firstRequest,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create leave request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

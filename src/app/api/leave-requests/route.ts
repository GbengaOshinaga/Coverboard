import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserLeaveBalance } from "@/lib/leave-balances";
import { countWeekdays } from "@/lib/utils";
import { notifyNewRequest } from "@/lib/slack-notifications";
import { emailNewRequest } from "@/lib/email-notifications";
import { calculateSspPayableDays, calculateEstimatedSspCost } from "@/lib/uk-compliance";
import { recordAudit, requestAuditContext } from "@/lib/audit";
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

  return NextResponse.json(requests);
}

const createSchema = z.object({
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  leaveTypeId: z.string(),
  note: z.string().optional(),
  evidenceProvided: z.boolean().optional(),
  kitDaysUsed: z.number().int().min(0).optional(),
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

    const { startDate, endDate, leaveTypeId, note, evidenceProvided, kitDaysUsed } = parsed.data;
    const userId = (session.user as Record<string, unknown>).id as string;
    const leaveTypeConfig = await prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { name: true, minNoticeDays: true, requiresEvidence: true },
    });
    if (!leaveTypeConfig) {
      return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
    }
    const now = new Date();
    const noticeDays = Math.floor((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (noticeDays < leaveTypeConfig.minNoticeDays) {
      return NextResponse.json(
        { error: `This leave type requires at least ${leaveTypeConfig.minNoticeDays} days notice` },
        { status: 400 }
      );
    }
    if (leaveTypeConfig.requiresEvidence && !evidenceProvided) {
      return NextResponse.json(
        { error: "Evidence is required for this leave type" },
        { status: 400 }
      );
    }


    if (endDate < startDate) {
      return NextResponse.json(
        { error: "End date must be after start date" },
        { status: 400 }
      );
    }

    // Check leave balance (warn but don't block)
    let balanceWarning: string | null = null;
    try {
      const requestedDays = countWeekdays(startDate, endDate);
      const balance = await getUserLeaveBalance(
        userId,
        leaveTypeId,
        startDate.getFullYear()
      );
      if (balance && requestedDays > balance.remaining) {
        balanceWarning = `This request (${requestedDays} days) exceeds your remaining balance of ${balance.remaining} days for ${balance.leaveTypeName}.`;
      }
    } catch {
      // Don't block request creation if balance check fails
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        startDate,
        endDate,
        leaveTypeId,
        note,
        userId,
        evidenceProvided: evidenceProvided ?? false,
        kitDaysUsed: kitDaysUsed ?? 0,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            countryCode: true,
            memberType: true,
          },
        },
        leaveType: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    // Send notifications (fire and forget)
    const daysRequested = countWeekdays(startDate, endDate);
    const orgId = (session.user as Record<string, unknown>).organizationId as string;

    notifyNewRequest({
      requestId: leaveRequest.id,
      userName: leaveRequest.user.name,
      leaveTypeName: leaveRequest.leaveType.name,
      startDate,
      endDate,
      note: note ?? null,
      daysRequested,
    }).catch((err) => console.error("Slack notification error:", err));

    emailNewRequest({
      requesterName: leaveRequest.user.name,
      leaveTypeName: leaveRequest.leaveType.name,
      startDate,
      endDate,
      note: note ?? null,
      organizationId: orgId,
    }).catch((err) => console.error("Email notification error:", err));

    recordAudit({
      organizationId: orgId,
      action: "leave_request.created",
      resource: "leave_request",
      resourceId: leaveRequest.id,
      actor: {
        id: userId,
        email: leaveRequest.user.email,
        role: (session.user as Record<string, unknown>).role as string,
      },
      metadata: {
        leaveType: leaveRequest.leaveType.name,
        startDate,
        endDate,
        daysRequested,
      },
      context: requestAuditContext(request),
    });

    let sspInfo: { payableDays: number; estimatedCost: number } | null = null;
    if (leaveRequest.leaveType.name.includes("SSP")) {
      const payableDays = calculateSspPayableDays(startDate, endDate);
      sspInfo = {
        payableDays,
        estimatedCost: calculateEstimatedSspCost(startDate, endDate),
      };
    }

    return NextResponse.json({ ...leaveRequest, balanceWarning, sspInfo }, { status: 201 });
  } catch (error) {
    console.error("Create leave request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

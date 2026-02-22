import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserLeaveBalance } from "@/lib/leave-balances";
import { countWeekdays } from "@/lib/utils";
import { notifyNewRequest } from "@/lib/slack-notifications";
import { emailNewRequest } from "@/lib/email-notifications";
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

  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  const where: Record<string, unknown> = {
    user: { organizationId: orgId },
  };

  if (status) {
    where.status = status;
  }
  if (userId) {
    where.userId = userId;
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

    const { startDate, endDate, leaveTypeId, note } = parsed.data;
    const userId = (session.user as Record<string, unknown>).id as string;

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

    return NextResponse.json(
      { ...leaveRequest, balanceWarning },
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

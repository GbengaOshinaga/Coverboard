import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySlackRequest, resolveSlackUser, isSlackConfigured } from "@/lib/slack";
import { getUserLeaveBalances } from "@/lib/leave-balances";
import { countWeekdays } from "@/lib/utils";
import {
  buildWhosOutMessage,
  buildBalanceMessage,
  buildRequestConfirmation,
} from "@/lib/slack-messages";
import { notifyNewRequest } from "@/lib/slack-notifications";

export async function POST(request: Request) {
  if (!isSlackConfigured()) {
    return NextResponse.json(
      { response_type: "ephemeral", text: "Slack integration is not configured." },
      { status: 200 }
    );
  }

  // Read body as text for signature verification
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackRequest(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the URL-encoded form body
  const params = new URLSearchParams(rawBody);
  const command = params.get("command");
  const text = params.get("text") ?? "";
  const slackUserId = params.get("user_id") ?? "";

  // Resolve the Slack user to a Coverboard user
  const user = await resolveSlackUser(slackUserId);
  if (!user) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "I couldn't find your Coverboard account. Make sure your Slack email matches your Coverboard email.",
    });
  }

  switch (command) {
    case "/whosout":
      return handleWhosOut(user.organizationId);
    case "/mybalance":
      return handleMyBalance(user.id, user.name);
    case "/requestleave":
      return handleRequestLeave(user.id, user.organizationId, text);
    default:
      return NextResponse.json({
        response_type: "ephemeral",
        text: `Unknown command: ${command}`,
      });
  }
}

async function handleWhosOut(organizationId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [outToday, upcoming] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId },
        status: "APPROVED",
        startDate: { lte: endOfToday },
        endDate: { gte: today },
      },
      include: {
        user: { select: { name: true } },
        leaveType: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId },
        status: "APPROVED",
        startDate: { gt: endOfToday, lte: nextWeek },
      },
      include: {
        user: { select: { name: true } },
        leaveType: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
      take: 10,
    }),
  ]);

  const blocks = buildWhosOutMessage(
    outToday.map((r) => ({
      userName: r.user.name,
      leaveTypeName: r.leaveType.name,
      startDate: r.startDate,
      endDate: r.endDate,
    })),
    upcoming.map((r) => ({
      userName: r.user.name,
      leaveTypeName: r.leaveType.name,
      startDate: r.startDate,
      endDate: r.endDate,
    }))
  );

  return NextResponse.json({
    response_type: "in_channel",
    blocks,
  });
}

async function handleMyBalance(userId: string, userName: string) {
  const year = new Date().getFullYear();
  const balances = await getUserLeaveBalances(userId, year);

  const blocks = buildBalanceMessage(userName, year, balances);

  return NextResponse.json({
    response_type: "ephemeral",
    blocks,
  });
}

async function handleRequestLeave(
  userId: string,
  organizationId: string,
  text: string
) {
  // Expected format: "2026-03-01 2026-03-05 Annual Leave optional note here"
  // Or simpler: "2026-03-01 2026-03-05 Annual"
  const parts = text.trim().split(/\s+/);

  if (parts.length < 3) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: [
        "Usage: `/requestleave <start-date> <end-date> <leave-type> [note]`",
        "Example: `/requestleave 2026-03-01 2026-03-05 Annual Taking a break`",
        "Date format: YYYY-MM-DD",
        "Leave types are matched by name (e.g., Annual, Sick, Parental, Compassionate).",
      ].join("\n"),
    });
  }

  const startStr = parts[0];
  const endStr = parts[1];
  const leaveTypeName = parts[2];
  const note = parts.slice(3).join(" ") || undefined;

  // Validate dates
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Invalid date format. Please use YYYY-MM-DD (e.g., 2026-03-01).",
    });
  }

  if (endDate < startDate) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "End date must be on or after the start date.",
    });
  }

  // Find matching leave type (case-insensitive partial match)
  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId },
  });

  const leaveType = leaveTypes.find((lt) =>
    lt.name.toLowerCase().includes(leaveTypeName.toLowerCase())
  );

  if (!leaveType) {
    const available = leaveTypes.map((lt) => lt.name).join(", ");
    return NextResponse.json({
      response_type: "ephemeral",
      text: `Leave type "${leaveTypeName}" not found. Available types: ${available}`,
    });
  }

  // Create the leave request
  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      startDate,
      endDate,
      leaveTypeId: leaveType.id,
      note: note ?? null,
      userId,
    },
    include: {
      user: { select: { name: true, email: true } },
      leaveType: { select: { name: true, color: true } },
    },
  });

  const daysRequested = countWeekdays(startDate, endDate);

  // Send notification to the channel (fire and forget)
  notifyNewRequest({
    requestId: leaveRequest.id,
    userName: leaveRequest.user.name,
    leaveTypeName: leaveRequest.leaveType.name,
    startDate,
    endDate,
    note: note ?? null,
    daysRequested,
  }).catch((err) => console.error("Failed to send Slack notification:", err));

  const blocks = buildRequestConfirmation({
    leaveTypeName: leaveRequest.leaveType.name,
    startDate,
    endDate,
    daysRequested,
  });

  return NextResponse.json({
    response_type: "ephemeral",
    blocks,
  });
}

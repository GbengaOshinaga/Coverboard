import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySlackRequest,
  resolveSlackUser,
  isSlackAppConfigured,
  getSlackIntegrationByTeamId,
  createSlackClient,
} from "@/lib/slack";
import { getUserLeaveBalances } from "@/lib/leave-balances";
import { countWeekdays } from "@/lib/utils";
import {
  buildWhosOutMessage,
  buildBalanceMessage,
  buildRequestConfirmation,
} from "@/lib/slack-messages";
import { notifyNewRequest } from "@/lib/slack-notifications";

export async function POST(request: Request) {
  if (!isSlackAppConfigured()) {
    return NextResponse.json(
      { response_type: "ephemeral", text: "Slack integration is not configured." },
      { status: 200 }
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackRequest(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get("command");
  const text = params.get("text") ?? "";
  const slackUserId = params.get("user_id") ?? "";
  const teamId = params.get("team_id") ?? "";

  if (!teamId) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Missing workspace information.",
    });
  }

  const integration = await getSlackIntegrationByTeamId(teamId);
  if (!integration) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "This Slack workspace is not connected to Coverboard. Ask your admin to connect Slack in Settings.",
    });
  }

  const slack = createSlackClient(integration.botToken);
  const user = await resolveSlackUser(
    slackUserId,
    slack,
    integration.organizationId
  );

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
      return handleRequestLeave(
        user.id,
        user.organizationId,
        text,
        leaveRequest => {
          const daysRequested = countWeekdays(
            leaveRequest.startDate,
            leaveRequest.endDate
          );
          notifyNewRequest({
            organizationId: user.organizationId,
            requestId: leaveRequest.id,
            userName: leaveRequest.user.name,
            leaveTypeName: leaveRequest.leaveType.name,
            startDate: leaveRequest.startDate,
            endDate: leaveRequest.endDate,
            note: leaveRequest.note,
            daysRequested,
          }).catch((err) =>
            console.error("Failed to send Slack notification:", err)
          );
        }
      );
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
  text: string,
  onCreated: (leaveRequest: {
    id: string;
    startDate: Date;
    endDate: Date;
    note: string | null;
    user: { name: string };
    leaveType: { name: string };
  }) => void
) {
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
  onCreated(leaveRequest);

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

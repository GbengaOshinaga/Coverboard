import { after } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySlackRequest,
  resolveSlackUser,
  isSlackAppConfigured,
  getSlackIntegrationByTeamId,
  createSlackClient,
  postSlackCommandResponse,
} from "@/lib/slack";
import { getUserLeaveBalances } from "@/lib/leave-balances";
import { countWeekdays } from "@/lib/utils";
import {
  buildWhosOutMessage,
  buildBalanceMessage,
  buildRequestConfirmation,
  summarizeWhosOutText,
} from "@/lib/slack-messages";
import { notifyNewRequest } from "@/lib/slack-notifications";

type SlackCommandResponse = {
  response_type: "ephemeral" | "in_channel";
  text: string;
  blocks?: ReturnType<typeof buildWhosOutMessage>;
};

function ephemeral(text: string): SlackCommandResponse {
  return { response_type: "ephemeral", text };
}

export async function POST(request: Request) {
  if (!isSlackAppConfigured()) {
    return NextResponse.json(
      ephemeral("Slack integration is not configured on this Coverboard instance.")
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackRequest(rawBody, timestamp, signature)) {
    console.error("Slack slash command: invalid signature");
    return NextResponse.json(
      ephemeral("Could not verify this request came from Slack.")
    );
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get("command");
  const text = params.get("text") ?? "";
  const slackUserId = params.get("user_id") ?? "";
  const teamId = params.get("team_id") ?? "";
  const responseUrl = params.get("response_url");

  if (!teamId) {
    return NextResponse.json(ephemeral("Missing workspace information."));
  }

  if (!command) {
    return NextResponse.json(ephemeral("Missing command."));
  }

  const integration = await getSlackIntegrationByTeamId(teamId);
  if (!integration) {
    return NextResponse.json(
      ephemeral(
        "This Slack workspace is not connected to Coverboard. Ask your admin to connect Slack in Settings."
      )
    );
  }

  if (!responseUrl) {
    return NextResponse.json(
      ephemeral("Slack did not provide a response URL. Please try again.")
    );
  }

  // Acknowledge within Slack's 3s window; deliver the real payload via response_url.
  after(async () => {
    try {
      const payload = await buildCommandResponse({
        command,
        text,
        slackUserId,
        organizationId: integration.organizationId,
        botToken: integration.botToken,
      });
      await postSlackCommandResponse(responseUrl, payload);
    } catch (error) {
      console.error("Slack slash command failed:", error);
      await postSlackCommandResponse(
        responseUrl,
        ephemeral("Something went wrong. Please try again in a moment.")
      );
    }
  });

  return new Response("", { status: 200 });
}

async function buildCommandResponse(input: {
  command: string;
  text: string;
  slackUserId: string;
  organizationId: string;
  botToken: string;
}): Promise<SlackCommandResponse> {
  const { command, text, slackUserId, organizationId, botToken } = input;

  switch (command) {
    case "/whosout":
      return handleWhosOut(organizationId);

    case "/mybalance":
    case "/requestleave": {
      const slack = createSlackClient(botToken);
      const user = await resolveSlackUser(
        slackUserId,
        slack,
        organizationId
      );
      if (!user) {
        return ephemeral(
          "I couldn't find your Coverboard account. Make sure your Slack email matches your Coverboard email."
        );
      }
      if (command === "/mybalance") {
        return handleMyBalance(user.id, user.name);
      }
      return handleRequestLeave(
        user.id,
        organizationId,
        text,
        (leaveRequest) => {
          const daysRequested = countWeekdays(
            leaveRequest.startDate,
            leaveRequest.endDate
          );
          notifyNewRequest({
            organizationId,
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
    }

    default:
      return ephemeral(`Unknown command: ${command}`);
  }
}

async function handleWhosOut(organizationId: string): Promise<SlackCommandResponse> {
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

  const outTodayRows = outToday.map((r) => ({
    userName: r.user.name,
    leaveTypeName: r.leaveType.name,
    startDate: r.startDate,
    endDate: r.endDate,
  }));
  const upcomingRows = upcoming.map((r) => ({
    userName: r.user.name,
    leaveTypeName: r.leaveType.name,
    startDate: r.startDate,
    endDate: r.endDate,
  }));

  return {
    response_type: "in_channel",
    text: summarizeWhosOutText(outTodayRows, upcomingRows),
    blocks: buildWhosOutMessage(outTodayRows, upcomingRows),
  };
}

async function handleMyBalance(
  userId: string,
  userName: string
): Promise<SlackCommandResponse> {
  const year = new Date().getFullYear();
  const balances = await getUserLeaveBalances(userId, year);
  const blocks = buildBalanceMessage(userName, year, balances);

  return {
    response_type: "ephemeral",
    text: `Leave balance for ${userName} (${year})`,
    blocks,
  };
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
): Promise<SlackCommandResponse> {
  const parts = text.trim().split(/\s+/);

  if (parts.length < 3) {
    return ephemeral(
      [
        "Usage: `/requestleave <start-date> <end-date> <leave-type> [note]`",
        "Example: `/requestleave 2026-03-01 2026-03-05 Annual Taking a break`",
        "Date format: YYYY-MM-DD",
        "Leave types are matched by name (e.g., Annual, Sick, Parental, Compassionate).",
      ].join("\n")
    );
  }

  const startStr = parts[0];
  const endStr = parts[1];
  const leaveTypeName = parts[2];
  const note = parts.slice(3).join(" ") || undefined;

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return ephemeral(
      "Invalid date format. Please use YYYY-MM-DD (e.g., 2026-03-01)."
    );
  }

  if (endDate < startDate) {
    return ephemeral("End date must be on or after the start date.");
  }

  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId },
  });

  const leaveType = leaveTypes.find((lt) =>
    lt.name.toLowerCase().includes(leaveTypeName.toLowerCase())
  );

  if (!leaveType) {
    const available = leaveTypes.map((lt) => lt.name).join(", ");
    return ephemeral(
      `Leave type "${leaveTypeName}" not found. Available types: ${available}`
    );
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

  return {
    response_type: "ephemeral",
    text: `Leave request submitted: ${leaveRequest.leaveType.name}, ${daysRequested} day(s).`,
    blocks,
  };
}

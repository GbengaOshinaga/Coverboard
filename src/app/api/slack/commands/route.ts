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
import {
  buildWhosOutMessage,
  buildBalanceMessage,
  buildRequestConfirmation,
  summarizeWhosOutText,
} from "@/lib/slack-messages";
import { createLeaveRequest } from "@/lib/leave-requests/create";

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
        { id: user.id, email: user.email, role: user.role },
        organizationId,
        text
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
  user: { id: string; email: string; role: string },
  organizationId: string,
  text: string
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

  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId },
  });

  const search = leaveTypeName.toLowerCase();
  // Prefer an exact name match, then fall back to a substring match. Avoids
  // silently picking the wrong type when several share a word.
  const leaveType =
    leaveTypes.find((lt) => lt.name.toLowerCase() === search) ??
    leaveTypes.find((lt) => lt.name.toLowerCase().includes(search));

  if (!leaveType) {
    const available = leaveTypes.map((lt) => lt.name).join(", ");
    return ephemeral(
      `Leave type "${leaveTypeName}" not found. Available types: ${available}`
    );
  }

  // Route through the shared create core so the Slack path enforces the same
  // notice/evidence/statutory rules, auto-approval, audit, and analytics as
  // the web app.
  const result = await createLeaveRequest({
    actor: { id: user.id, email: user.email, role: user.role },
    organizationId,
    leaveTypeId: leaveType.id,
    startDate,
    endDate,
    note,
    context: { userAgent: "slack" },
  });

  if (!result.ok) {
    return ephemeral(result.error);
  }

  const blocks = buildRequestConfirmation({
    leaveTypeName: result.request.leaveType.name,
    startDate,
    endDate,
    daysRequested: result.daysRequested,
  });

  const headline = result.autoApproved
    ? `Leave request auto-approved: ${result.request.leaveType.name}, ${result.daysRequested} day(s).`
    : `Leave request submitted: ${result.request.leaveType.name}, ${result.daysRequested} day(s).`;

  return {
    response_type: "ephemeral",
    text: result.balanceWarning ? `${headline}\n⚠️ ${result.balanceWarning}` : headline,
    blocks,
  };
}

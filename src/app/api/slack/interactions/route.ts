import { NextResponse } from "next/server";
import {
  verifySlackRequest,
  resolveSlackUser,
  isSlackAppConfigured,
  getSlackIntegrationByTeamId,
  createSlackClient,
} from "@/lib/slack";
import { reviewLeaveRequest } from "@/lib/leave-requests/review";

export async function POST(request: Request) {
  if (!isSlackAppConfigured()) {
    return new Response("Not configured", { status: 200 });
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackRequest(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");

  if (!payloadStr) {
    return new Response("Missing payload", { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  if (payload.type === "block_actions") {
    return handleBlockAction(payload);
  }

  return new Response("OK", { status: 200 });
}

async function handleBlockAction(payload: {
  team: { id: string };
  user: { id: string };
  actions: { action_id: string; value: string }[];
  message: { ts: string };
  channel: { id: string };
}) {
  const action = payload.actions[0];
  if (!action) return new Response("OK", { status: 200 });

  const { action_id, value: requestId } = action;

  if (action_id !== "approve_leave" && action_id !== "reject_leave") {
    return new Response("OK", { status: 200 });
  }

  const integration = await getSlackIntegrationByTeamId(payload.team.id);
  if (!integration) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "This Slack workspace is not connected to Coverboard.",
      replace_original: false,
    });
  }

  const slack = createSlackClient(integration.botToken);

  const reviewer = await resolveSlackUser(
    payload.user.id,
    slack,
    integration.organizationId
  );

  if (!reviewer) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Could not find your Coverboard account.",
      replace_original: false,
    });
  }

  const decision = action_id === "approve_leave" ? "APPROVED" : "REJECTED";

  // Shared core: same segregation-of-duties guard, notifications, audit, and
  // analytics as the web approval path.
  const result = await reviewLeaveRequest({
    requestId,
    decision,
    reviewer: {
      id: reviewer.id,
      name: reviewer.name,
      email: reviewer.email,
      role: reviewer.role,
    },
    organizationId: integration.organizationId,
    context: { userAgent: "slack" },
  });

  if (!result.ok) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: result.message,
      replace_original: false,
    });
  }

  const statusEmoji = decision === "APPROVED" ? ":white_check_mark:" : ":x:";
  const statusText = decision === "APPROVED" ? "Approved" : "Rejected";

  try {
    await slack.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${statusEmoji} *${result.request.userName}*'s leave request — *${statusText}* by ${reviewer.name}`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Type:*\n${result.request.leaveTypeName}`,
            },
            {
              type: "mrkdwn",
              text: `*Days:*\n${result.request.daysRequested}`,
            },
          ],
        },
      ],
      text: `${result.request.userName}'s leave request ${statusText.toLowerCase()} by ${reviewer.name}`,
    });
  } catch (err) {
    console.error("Failed to update Slack message:", err);
  }

  return new Response("", { status: 200 });
}

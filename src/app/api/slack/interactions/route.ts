import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySlackRequest,
  resolveSlackUser,
  isSlackConfigured,
  slack,
  findSlackUserByEmail,
} from "@/lib/slack";
import { buildStatusUpdateMessage } from "@/lib/slack-messages";
import { countWeekdays } from "@/lib/utils";

export async function POST(request: Request) {
  if (!isSlackConfigured()) {
    return new Response("Not configured", { status: 200 });
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackRequest(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Slack sends interactions as a URL-encoded "payload" JSON string
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

  // Resolve the Slack user who clicked the button
  const reviewer = await resolveSlackUser(payload.user.id);
  if (!reviewer) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Could not find your Coverboard account.",
      replace_original: false,
    });
  }

  // Check reviewer permissions
  if (reviewer.role !== "ADMIN" && reviewer.role !== "MANAGER") {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Only admins and managers can approve or reject leave requests.",
      replace_original: false,
    });
  }

  const newStatus = action_id === "approve_leave" ? "APPROVED" : "REJECTED";

  // Fetch and update the leave request
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { name: true, email: true } },
      leaveType: { select: { name: true } },
    },
  });

  if (!leaveRequest) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Leave request not found.",
      replace_original: false,
    });
  }

  if (leaveRequest.status !== "PENDING") {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `This request has already been ${leaveRequest.status.toLowerCase()}.`,
      replace_original: false,
    });
  }

  // Update the request
  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: {
      status: newStatus as "APPROVED" | "REJECTED",
      reviewedById: reviewer.id,
      reviewedAt: new Date(),
    },
  });

  const daysRequested = countWeekdays(
    leaveRequest.startDate,
    leaveRequest.endDate
  );

  // Update the original message to remove buttons and show the decision
  const statusEmoji = newStatus === "APPROVED" ? ":white_check_mark:" : ":x:";
  const statusText = newStatus === "APPROVED" ? "Approved" : "Rejected";

  if (slack) {
    try {
      await slack.chat.update({
        channel: payload.channel.id,
        ts: payload.message.ts,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${statusEmoji} *${leaveRequest.user.name}*'s leave request — *${statusText}* by ${reviewer.name}`,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Type:*\n${leaveRequest.leaveType.name}`,
              },
              {
                type: "mrkdwn",
                text: `*Days:*\n${daysRequested}`,
              },
            ],
          },
        ],
        text: `${leaveRequest.user.name}'s leave request ${statusText.toLowerCase()} by ${reviewer.name}`,
      });
    } catch (err) {
      console.error("Failed to update Slack message:", err);
    }

    // DM the requester about the decision
    try {
      const requesterSlackId = await findSlackUserByEmail(
        leaveRequest.user.email
      );
      if (requesterSlackId) {
        const dmBlocks = buildStatusUpdateMessage({
          status: newStatus as "APPROVED" | "REJECTED",
          leaveTypeName: leaveRequest.leaveType.name,
          startDate: leaveRequest.startDate,
          endDate: leaveRequest.endDate,
          reviewerName: reviewer.name,
          daysRequested,
        });

        await slack.chat.postMessage({
          channel: requesterSlackId,
          blocks: dmBlocks,
          text: `Your ${leaveRequest.leaveType.name} request was ${statusText.toLowerCase()}.`,
        });
      }
    } catch (err) {
      console.error("Failed to DM requester:", err);
    }
  }

  return new Response("", { status: 200 });
}

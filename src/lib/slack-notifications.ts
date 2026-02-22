import { slack, getNotificationChannel, findSlackUserByEmail, isSlackConfigured } from "@/lib/slack";
import { buildNewRequestNotification, buildStatusUpdateMessage } from "@/lib/slack-messages";
import { countWeekdays } from "@/lib/utils";

/**
 * Send a notification to the team channel when a new leave request is created.
 * Includes approve/reject buttons for managers.
 */
export async function notifyNewRequest(data: {
  requestId: string;
  userName: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  note: string | null;
  daysRequested: number;
}) {
  if (!isSlackConfigured() || !slack) return;

  const channel = getNotificationChannel();
  const blocks = buildNewRequestNotification(data);

  try {
    await slack.chat.postMessage({
      channel,
      blocks,
      text: `New leave request from ${data.userName}: ${data.leaveTypeName} (${data.daysRequested} days)`,
    });
  } catch (error) {
    console.error("Failed to send new request notification to Slack:", error);
  }
}

/**
 * Send a DM to the requester when their leave is approved or rejected.
 */
export async function notifyRequestStatusChange(data: {
  requesterEmail: string;
  status: "APPROVED" | "REJECTED";
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  reviewerName: string;
}) {
  if (!isSlackConfigured() || !slack) return;

  const daysRequested = countWeekdays(data.startDate, data.endDate);

  try {
    const slackUserId = await findSlackUserByEmail(data.requesterEmail);
    if (!slackUserId) return;

    const blocks = buildStatusUpdateMessage({
      status: data.status,
      leaveTypeName: data.leaveTypeName,
      startDate: data.startDate,
      endDate: data.endDate,
      reviewerName: data.reviewerName,
      daysRequested,
    });

    await slack.chat.postMessage({
      channel: slackUserId,
      blocks,
      text: `Your ${data.leaveTypeName} request was ${data.status.toLowerCase()}.`,
    });
  } catch (error) {
    console.error("Failed to send status update DM:", error);
  }
}

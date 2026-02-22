import { formatDateRange, countWeekdays } from "@/lib/utils";
import type { KnownBlock } from "@slack/web-api";

type AbsentPerson = {
  userName: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
};

/**
 * Build the Block Kit response for /whosout
 */
export function buildWhosOutMessage(
  outToday: AbsentPerson[],
  upcoming: AbsentPerson[]
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "Who's out today?",
      emoji: true,
    },
  });

  // Out today section
  if (outToday.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":tada: *Everyone is in today!* No one has approved leave.",
      },
    });
  } else {
    const lines = outToday.map(
      (p) =>
        `:palm_tree: *${p.userName}* — ${p.leaveTypeName} (${formatDateRange(p.startDate, p.endDate)})`
    );
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${outToday.length} team member${outToday.length !== 1 ? "s" : ""} out today:*\n${lines.join("\n")}`,
      },
    });
  }

  // Upcoming section
  if (upcoming.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Upcoming (next 7 days):*",
      },
    });

    const upcomingLines = upcoming.map(
      (p) =>
        `• *${p.userName}* — ${p.leaveTypeName} · ${formatDateRange(p.startDate, p.endDate)}`
    );
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: upcomingLines.join("\n"),
      },
    });
  }

  return blocks;
}

type BalanceEntry = {
  leaveTypeName: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
};

/**
 * Build the Block Kit response for /mybalance
 */
export function buildBalanceMessage(
  userName: string,
  year: number,
  balances: BalanceEntry[]
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `Leave balance for ${year}`,
      emoji: true,
    },
  });

  if (balances.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No leave types are configured for your organization.",
      },
    });
    return blocks;
  }

  const lines = balances.map((b) => {
    const bar = buildProgressBar(b.used + b.pending, b.allowance);
    const warning = b.remaining <= 3 ? " :warning:" : "";
    return `*${b.leaveTypeName}*\n${bar}  ${b.remaining}/${b.allowance} remaining · ${b.used} used${b.pending > 0 ? ` · ${b.pending} pending` : ""}${warning}`;
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: lines.join("\n\n"),
    },
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Balance for *${userName}* as of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      },
    ],
  });

  return blocks;
}

function buildProgressBar(used: number, total: number): string {
  const filled = total > 0 ? Math.round((used / total) * 10) : 0;
  const empty = 10 - Math.min(filled, 10);
  return ":large_green_square:".repeat(Math.min(filled, 10)) + ":white_large_square:".repeat(empty);
}

/**
 * Build a notification message for a new leave request (with approve/reject buttons)
 */
export function buildNewRequestNotification(data: {
  requestId: string;
  userName: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  note: string | null;
  daysRequested: number;
}): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `:envelope: *New leave request from ${data.userName}*`,
    },
  });

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Type:*\n${data.leaveTypeName}` },
      { type: "mrkdwn", text: `*Days:*\n${data.daysRequested} weekday${data.daysRequested !== 1 ? "s" : ""}` },
      {
        type: "mrkdwn",
        text: `*Dates:*\n${formatDateRange(data.startDate, data.endDate)}`,
      },
      ...(data.note
        ? [{ type: "mrkdwn" as const, text: `*Note:*\n${data.note}` }]
        : []),
    ],
  });

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Approve", emoji: true },
        style: "primary",
        action_id: "approve_leave",
        value: data.requestId,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Reject", emoji: true },
        style: "danger",
        action_id: "reject_leave",
        value: data.requestId,
      },
    ],
  });

  return blocks;
}

/**
 * Build a DM notification for the requester when their request is approved/rejected
 */
export function buildStatusUpdateMessage(data: {
  status: "APPROVED" | "REJECTED";
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  reviewerName: string;
  daysRequested: number;
}): KnownBlock[] {
  const emoji = data.status === "APPROVED" ? ":white_check_mark:" : ":x:";
  const statusText = data.status === "APPROVED" ? "approved" : "rejected";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} Your *${data.leaveTypeName}* request has been *${statusText}* by ${data.reviewerName}.`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Dates:*\n${formatDateRange(data.startDate, data.endDate)}`,
        },
        {
          type: "mrkdwn",
          text: `*Days:*\n${data.daysRequested} weekday${data.daysRequested !== 1 ? "s" : ""}`,
        },
      ],
    },
  ];
}

/**
 * Build a confirmation message shown in Slack after submitting /requestleave
 */
export function buildRequestConfirmation(data: {
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
}): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:white_check_mark: *Leave request submitted!*\n${data.leaveTypeName} · ${formatDateRange(data.startDate, data.endDate)} · ${data.daysRequested} day${data.daysRequested !== 1 ? "s" : ""}\n\nYour manager will be notified. You'll get a DM when it's reviewed.`,
      },
    },
  ];
}

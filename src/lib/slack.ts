import { WebClient } from "@slack/web-api";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// Singleton Slack Web API client
const slackToken = process.env.SLACK_BOT_TOKEN;
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;

export const slack = slackToken ? new WebClient(slackToken) : null;

export function isSlackConfigured(): boolean {
  return !!slackToken && !!slackSigningSecret;
}

export function getNotificationChannel(): string {
  return process.env.SLACK_NOTIFICATION_CHANNEL ?? "#time-off";
}

/**
 * Verify that an incoming request is genuinely from Slack.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackRequest(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  if (!slackSigningSecret) return false;

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac("sha256", slackSigningSecret)
    .update(sigBasestring)
    .digest("hex");
  const expectedSignature = `v0=${hmac}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Look up a Coverboard user by their Slack email.
 * Slack sends a user_id; we call users.info to get their email,
 * then match against our User table.
 */
export async function resolveSlackUser(slackUserId: string) {
  if (!slack) return null;

  try {
    const result = await slack.users.info({ user: slackUserId });
    const email = result.user?.profile?.email;

    if (!email) return null;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    return user;
  } catch (error) {
    console.error("Failed to resolve Slack user:", error);
    return null;
  }
}

/**
 * Look up a Slack user ID by their email address.
 */
export async function findSlackUserByEmail(
  email: string
): Promise<string | null> {
  if (!slack) return null;

  try {
    const result = await slack.users.lookupByEmail({ email });
    return result.user?.id ?? null;
  } catch {
    return null;
  }
}

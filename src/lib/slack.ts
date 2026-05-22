import { WebClient } from "@slack/web-api";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const slackClientId = process.env.SLACK_CLIENT_ID ?? "";
const slackClientSecret = process.env.SLACK_CLIENT_SECRET ?? "";
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET ?? "";

export const SLACK_BOT_SCOPES = [
  "commands",
  "chat:write",
  "users:read",
  "users:read.email",
] as const;

/** Platform-level Slack app credentials (one Coverboard app for all customers). */
export function isSlackAppConfigured(): boolean {
  return !!slackClientId && !!slackClientSecret && !!slackSigningSecret;
}

export function getSlackClientId(): string {
  return slackClientId;
}

export function getSlackClientSecret(): string {
  return slackClientSecret;
}

export function defaultNotificationChannel(): string {
  return process.env.SLACK_NOTIFICATION_CHANNEL ?? "#time-off";
}

export function createSlackClient(botToken: string): WebClient {
  return new WebClient(botToken);
}

export async function getSlackIntegrationByOrgId(organizationId: string) {
  return prisma.slackIntegration.findUnique({
    where: { organizationId },
  });
}

export async function getSlackIntegrationByTeamId(teamId: string) {
  return prisma.slackIntegration.findUnique({
    where: { teamId },
  });
}

export async function getSlackClientForOrg(organizationId: string): Promise<{
  client: WebClient;
  integration: NonNullable<Awaited<ReturnType<typeof getSlackIntegrationByOrgId>>>;
} | null> {
  const integration = await getSlackIntegrationByOrgId(organizationId);
  if (!integration) return null;
  return { client: createSlackClient(integration.botToken), integration };
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

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
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
 * Look up a Coverboard user by their Slack email within an organization.
 */
export async function resolveSlackUser(
  slackUserId: string,
  client: WebClient,
  organizationId: string
) {
  try {
    const result = await client.users.info({ user: slackUserId });
    const email = result.user?.profile?.email;

    if (!email) return null;

    const user = await prisma.user.findFirst({
      where: { email, organizationId },
      include: { organization: true },
    });

    return user;
  } catch (error) {
    console.error("Failed to resolve Slack user:", error);
    return null;
  }
}

export async function findSlackUserByEmail(
  email: string,
  client: WebClient
): Promise<string | null> {
  try {
    const result = await client.users.lookupByEmail({ email });
    return result.user?.id ?? null;
  } catch {
    return null;
  }
}

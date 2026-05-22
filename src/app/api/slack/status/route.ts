import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSlackAppConfigured, createSlackClient } from "@/lib/slack";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  if (!isSlackAppConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      botName: null,
      teamName: null,
      channel: null,
      connectedBy: null,
    });
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: { organizationId: orgId },
    select: {
      teamName: true,
      notificationChannel: true,
      botToken: true,
      createdAt: true,
      connectedBy: { select: { name: true } },
    },
  });

  if (!integration) {
    return NextResponse.json({
      configured: true,
      connected: false,
      botName: null,
      teamName: null,
      channel: null,
      connectedBy: null,
    });
  }

  try {
    const client = createSlackClient(integration.botToken);
    const auth = await client.auth.test();

    return NextResponse.json({
      configured: true,
      connected: true,
      botName: auth.user ?? null,
      teamName: integration.teamName,
      channel: integration.notificationChannel,
      connectedBy: integration.connectedBy.name,
      connectedAt: integration.createdAt,
    });
  } catch (error) {
    console.error("Slack connection test failed:", error);
    return NextResponse.json({
      configured: true,
      connected: false,
      botName: null,
      teamName: integration.teamName,
      channel: integration.notificationChannel,
      connectedBy: integration.connectedBy.name,
      error: "Failed to connect to Slack — try reconnecting",
    });
  }
}

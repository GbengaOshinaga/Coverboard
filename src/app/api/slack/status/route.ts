import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSlackAppConfigured, createSlackClient } from "@/lib/slack";
import { isPrismaMissingTableError } from "@/lib/prisma-errors";

const NOT_CONFIGURED = {
  configured: false,
  connected: false,
  botName: null,
  teamName: null,
  channel: null,
  connectedBy: null,
} as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = (session.user as Record<string, unknown>)
      .organizationId as string;

    if (!isSlackAppConfigured()) {
      return NextResponse.json(NOT_CONFIGURED);
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

    const connectedByName = integration.connectedBy?.name ?? null;

    try {
      const client = createSlackClient(integration.botToken);
      const auth = await client.auth.test();

      return NextResponse.json({
        configured: true,
        connected: true,
        botName: auth.user ?? null,
        teamName: integration.teamName,
        channel: integration.notificationChannel,
        connectedBy: connectedByName,
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
        connectedBy: connectedByName,
        error: "Failed to connect to Slack — try reconnecting",
      });
    }
  } catch (error) {
    console.error("Slack status error:", error);

    if (isPrismaMissingTableError(error, "SlackIntegration")) {
      return NextResponse.json(
        {
          ...NOT_CONFIGURED,
          error:
            "Slack database tables are missing on this deployment. Run prisma migrate deploy against the staging database.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to load Slack status" },
      { status: 500 }
    );
  }
}

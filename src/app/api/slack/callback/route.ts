import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getSlackClientId,
  getSlackClientSecret,
  defaultNotificationChannel,
} from "@/lib/slack";
import { getAppBaseUrl } from "@/lib/app-url";

const SLACK_REDIRECT_URI =
  process.env.SLACK_REDIRECT_URI ?? `${getAppBaseUrl()}/api/slack/callback`;

export async function GET(request: Request) {
  const baseUrl = getAppBaseUrl();
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const userRole = (session.user as Record<string, unknown>).role as string;

  if (userRole !== "ADMIN") {
    return NextResponse.redirect(`${baseUrl}/settings?slack_error=forbidden`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/settings?slack_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?slack_error=missing_params`);
  }

  const cookies = request.headers.get("cookie") ?? "";
  const stateMatch = cookies.match(/slack_oauth_state=([^;]+)/);
  const savedState = stateMatch?.[1];

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${baseUrl}/settings?slack_error=invalid_state`);
  }

  try {
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: getSlackClientId(),
        client_secret: getSlackClientSecret(),
        code,
        redirect_uri: SLACK_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.ok) {
      console.error("Slack token exchange failed:", tokenData);
      return NextResponse.redirect(`${baseUrl}/settings?slack_error=token_exchange_failed`);
    }

    const teamId = tokenData.team?.id as string | undefined;
    const teamName = tokenData.team?.name as string | undefined;
    const botToken = tokenData.access_token as string | undefined;
    const botUserId = tokenData.bot_user_id as string | undefined;

    if (!teamId || !teamName || !botToken) {
      return NextResponse.redirect(`${baseUrl}/settings?slack_error=invalid_response`);
    }

    // One Coverboard org per Slack workspace
    const existingForTeam = await prisma.slackIntegration.findUnique({
      where: { teamId },
      select: { organizationId: true },
    });

    if (existingForTeam && existingForTeam.organizationId !== orgId) {
      return NextResponse.redirect(`${baseUrl}/settings?slack_error=workspace_already_linked`);
    }

    await prisma.slackIntegration.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        teamId,
        teamName,
        botToken,
        botUserId: botUserId ?? null,
        notificationChannel: defaultNotificationChannel(),
        connectedByUserId: userId,
      },
      update: {
        teamId,
        teamName,
        botToken,
        botUserId: botUserId ?? null,
        connectedByUserId: userId,
      },
    });

    const response = NextResponse.redirect(`${baseUrl}/settings?slack_connected=true`);
    response.cookies.delete("slack_oauth_state");
    return response;
  } catch (err) {
    console.error("Slack callback error:", err);
    return NextResponse.redirect(`${baseUrl}/settings?slack_error=unknown`);
  }
}

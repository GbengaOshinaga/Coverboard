import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { authOptions } from "@/lib/auth";
import {
  isSlackAppConfigured,
  getSlackClientId,
  SLACK_BOT_SCOPES,
} from "@/lib/slack";
import { getAppBaseUrl } from "@/lib/app-url";

const SLACK_REDIRECT_URI =
  process.env.SLACK_REDIRECT_URI ?? `${getAppBaseUrl()}/api/slack/callback`;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as Record<string, unknown>).role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can connect Slack" }, { status: 403 });
  }

  if (!isSlackAppConfigured()) {
    return NextResponse.json(
      { error: "Slack integration is not configured on this server" },
      { status: 400 }
    );
  }

  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: getSlackClientId(),
    scope: SLACK_BOT_SCOPES.join(","),
    redirect_uri: SLACK_REDIRECT_URI,
    state,
  });

  const url = `https://slack.com/oauth/v2/authorize?${params.toString()}`;

  const response = NextResponse.redirect(url);
  response.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}

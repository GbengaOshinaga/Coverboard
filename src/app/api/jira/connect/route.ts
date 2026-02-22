import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { authOptions } from "@/lib/auth";
import { isJiraConfigured, getJiraClientId } from "@/lib/jira";

const JIRA_REDIRECT_URI = process.env.JIRA_REDIRECT_URI ?? "http://localhost:3000/api/jira/callback";
const SCOPES = "read:jira-work write:jira-work read:jira-user read:me offline_access";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as Record<string, unknown>).role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can connect Jira" }, { status: 403 });
  }

  if (!isJiraConfigured()) {
    return NextResponse.json({ error: "Jira integration is not configured" }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: getJiraClientId(),
    scope: SCOPES,
    redirect_uri: JIRA_REDIRECT_URI,
    state,
    response_type: "code",
    prompt: "consent",
  });

  const url = `https://auth.atlassian.com/authorize?${params.toString()}`;

  const response = NextResponse.redirect(url);
  response.cookies.set("jira_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}

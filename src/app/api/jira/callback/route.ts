import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getJiraClientId } from "@/lib/jira";

const JIRA_CLIENT_SECRET = process.env.JIRA_CLIENT_SECRET ?? "";
const JIRA_REDIRECT_URI = process.env.JIRA_REDIRECT_URI ?? "http://localhost:3000/api/jira/callback";
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(`${BASE_URL}/login`);
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${BASE_URL}/settings?jira_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${BASE_URL}/settings?jira_error=missing_params`);
  }

  // Validate state from cookie
  const cookies = request.headers.get("cookie") ?? "";
  const stateMatch = cookies.match(/jira_oauth_state=([^;]+)/);
  const savedState = stateMatch?.[1];

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${BASE_URL}/settings?jira_error=invalid_state`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: getJiraClientId(),
        client_secret: JIRA_CLIENT_SECRET,
        code,
        redirect_uri: JIRA_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Jira token exchange failed:", errText);
      return NextResponse.redirect(`${BASE_URL}/settings?jira_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();

    // Get accessible resources (cloud ID + site URL)
    const resourcesRes = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (!resourcesRes.ok) {
      return NextResponse.redirect(`${BASE_URL}/settings?jira_error=resources_failed`);
    }

    const resources = await resourcesRes.json();

    if (!Array.isArray(resources) || resources.length === 0) {
      return NextResponse.redirect(`${BASE_URL}/settings?jira_error=no_sites`);
    }

    const site = resources[0];

    // Save or update the integration
    await prisma.jiraIntegration.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        cloudId: site.id,
        siteUrl: site.url,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        connectedByUserId: userId,
      },
      update: {
        cloudId: site.id,
        siteUrl: site.url,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        connectedByUserId: userId,
      },
    });

    const response = NextResponse.redirect(`${BASE_URL}/settings?jira_connected=true`);
    response.cookies.delete("jira_oauth_state");
    return response;
  } catch (error) {
    console.error("Jira callback error:", error);
    return NextResponse.redirect(`${BASE_URL}/settings?jira_error=unknown`);
  }
}

import { prisma } from "@/lib/prisma";

const JIRA_CLIENT_ID = process.env.JIRA_CLIENT_ID ?? "";
const JIRA_CLIENT_SECRET = process.env.JIRA_CLIENT_SECRET ?? "";
const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com";
const ATLASSIAN_API_URL = "https://api.atlassian.com";

export function isJiraConfigured(): boolean {
  return !!JIRA_CLIENT_ID && !!JIRA_CLIENT_SECRET;
}

export function getJiraClientId(): string {
  return JIRA_CLIENT_ID;
}

// ─── Token Management ────────────────────────────────────────────────

type JiraClient = {
  cloudId: string;
  accessToken: string;
  siteUrl: string;
};

async function refreshJiraToken(integrationId: string, refreshToken: string): Promise<string> {
  const res = await fetch(`${ATLASSIAN_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: JIRA_CLIENT_ID,
      client_secret: JIRA_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh Jira token: ${err}`);
  }

  const data = await res.json();

  await prisma.jiraIntegration.update({
    where: { id: integrationId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data.access_token;
}

export async function getJiraClient(orgId: string): Promise<JiraClient | null> {
  const integration = await prisma.jiraIntegration.findUnique({
    where: { organizationId: orgId },
  });

  if (!integration) return null;

  let { accessToken } = integration;

  // Refresh if token expires within 5 minutes
  if (integration.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    try {
      accessToken = await refreshJiraToken(integration.id, integration.refreshToken);
    } catch (error) {
      console.error("Jira token refresh failed:", error);
      return null;
    }
  }

  return {
    cloudId: integration.cloudId,
    accessToken,
    siteUrl: integration.siteUrl,
  };
}

// ─── Jira API Helpers ────────────────────────────────────────────────

async function jiraFetch(client: JiraClient, path: string, options?: RequestInit) {
  const url = `${ATLASSIAN_API_URL}/ex/jira/${client.cloudId}/rest/api/3${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
  });
  return res;
}

export type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  statusCategoryKey: string;
  priority: string;
  issueType: string;
  url: string;
};

export async function searchJiraIssues(
  orgId: string,
  jiraAccountId: string
): Promise<JiraIssue[]> {
  const client = await getJiraClient(orgId);
  if (!client) return [];

  const jql = `assignee = "${jiraAccountId}" AND statusCategory != Done ORDER BY priority DESC, updated DESC`;

  const res = await jiraFetch(client, "/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql,
      fields: ["summary", "status", "priority", "issuetype"],
      maxResults: 50,
    }),
  });

  if (!res.ok) {
    console.error("Jira issue search failed:", await res.text());
    return [];
  }

  const data = await res.json();

  return (data.issues ?? []).map((issue: Record<string, unknown>) => {
    const fields = issue.fields as Record<string, unknown>;
    const status = fields.status as Record<string, unknown>;
    const statusCategory = status.statusCategory as Record<string, unknown>;
    const priority = fields.priority as Record<string, unknown> | null;
    const issueType = fields.issuetype as Record<string, unknown>;

    return {
      key: issue.key as string,
      summary: (fields.summary as string) ?? "",
      status: (status.name as string) ?? "",
      statusCategoryKey: (statusCategory.key as string) ?? "",
      priority: (priority?.name as string) ?? "None",
      issueType: (issueType?.name as string) ?? "",
      url: `${client.siteUrl}/browse/${issue.key}`,
    };
  });
}

export async function reassignJiraIssue(
  orgId: string,
  issueKey: string,
  newJiraAccountId: string
): Promise<boolean> {
  const client = await getJiraClient(orgId);
  if (!client) return false;

  const res = await jiraFetch(client, `/issue/${issueKey}/assignee`, {
    method: "PUT",
    body: JSON.stringify({ accountId: newJiraAccountId }),
  });

  return res.ok;
}

// ─── User Resolution ─────────────────────────────────────────────────

export async function resolveJiraAccountId(
  orgId: string,
  userId: string,
  email: string
): Promise<string | null> {
  // Check cached mapping first
  const existing = await prisma.jiraUserMapping.findUnique({
    where: { userId_organizationId: { userId, organizationId: orgId } },
  });

  if (existing) return existing.jiraAccountId;

  // Look up in Jira by email
  const client = await getJiraClient(orgId);
  if (!client) return null;

  const res = await jiraFetch(client, `/user/search?query=${encodeURIComponent(email)}`);
  if (!res.ok) return null;

  const users = await res.json();
  if (!Array.isArray(users) || users.length === 0) return null;

  const jiraUser = users[0];
  const jiraAccountId = jiraUser.accountId as string;

  // Cache the mapping
  await prisma.jiraUserMapping.upsert({
    where: { userId_organizationId: { userId, organizationId: orgId } },
    create: {
      userId,
      organizationId: orgId,
      jiraAccountId,
      jiraEmail: (jiraUser.emailAddress as string) ?? email,
    },
    update: { jiraAccountId },
  });

  return jiraAccountId;
}

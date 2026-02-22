import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchJiraIssues, resolveJiraAccountId, getJiraClient } from "@/lib/jira";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!userId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "userId, startDate, and endDate are required" },
      { status: 400 }
    );
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  // Check if Jira is connected
  const client = await getJiraClient(orgId);
  if (!client) {
    return NextResponse.json({ connected: false, issues: [], availableTeammates: [] });
  }

  // Resolve the user's Jira account
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const jiraAccountId = await resolveJiraAccountId(orgId, userId, user.email);

  if (!jiraAccountId) {
    return NextResponse.json({
      connected: true,
      userMapped: false,
      issues: [],
      availableTeammates: [],
    });
  }

  // Search for open issues
  const issues = await searchJiraIssues(orgId, jiraAccountId);

  // Find available teammates (not on approved leave during the same dates)
  const start = new Date(startDate);
  const end = new Date(endDate);

  const busyUserIds = await prisma.leaveRequest.findMany({
    where: {
      user: { organizationId: orgId },
      status: "APPROVED",
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { userId: true },
  }).then((rows) => rows.map((r) => r.userId));

  // Include the requesting user in the "busy" set
  const busySet = new Set([...busyUserIds, userId]);

  const availableTeammates = await prisma.user.findMany({
    where: {
      organizationId: orgId,
      id: { notIn: Array.from(busySet) },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    connected: true,
    userMapped: true,
    issues,
    availableTeammates,
  });
}

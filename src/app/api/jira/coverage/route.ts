import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchJiraIssues, resolveJiraAccountId, getJiraClient } from "@/lib/jira";

/**
 * Open Jira issues for someone about to be off, and (for admins and managers,
 * who can reassign) who's free to take them. Staff can only check their own:
 * a colleague's tickets aren't theirs to see, and the teammate list is for
 * reassigning, which staff can't do. No emails are returned; the team list
 * hides them from staff and the screen doesn't need them.
 */
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

  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const canManage = sessionUser.role === "ADMIN" || sessionUser.role === "MANAGER";
  if (!canManage && userId !== sessionUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if Jira is connected
  const client = await getJiraClient(orgId);
  if (!client) {
    return NextResponse.json({ connected: false, issues: [], availableTeammates: [] });
  }

  // Resolve the user's Jira account
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: orgId },
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
  if (!canManage) {
    return NextResponse.json({ connected: true, userMapped: true, issues, availableTeammates: [] });
  }

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
      isActive: true,
      id: { notIn: Array.from(busySet) },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    connected: true,
    userMapped: true,
    issues,
    availableTeammates,
  });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reassignJiraIssue, resolveJiraAccountId } from "@/lib/jira";
import { z } from "zod";

const schema = z.object({
  issueKey: z.string().min(1),
  newAssigneeUserId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as Record<string, unknown>).role as string;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Only admins and managers can reassign" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { issueKey, newAssigneeUserId } = parsed.data;
    const orgId = (session.user as Record<string, unknown>).organizationId as string;

    const newAssignee = await prisma.user.findUnique({
      where: { id: newAssigneeUserId },
      select: { email: true },
    });

    if (!newAssignee) {
      return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
    }

    const jiraAccountId = await resolveJiraAccountId(orgId, newAssigneeUserId, newAssignee.email);

    if (!jiraAccountId) {
      return NextResponse.json(
        { error: "Could not find this user in Jira. Make sure their email matches." },
        { status: 400 }
      );
    }

    const success = await reassignJiraIssue(orgId, issueKey, jiraAccountId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to reassign issue in Jira" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Jira reassign error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

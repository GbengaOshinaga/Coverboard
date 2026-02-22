import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isJiraConfigured } from "@/lib/jira";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  if (!isJiraConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      siteUrl: null,
      connectedBy: null,
    });
  }

  const integration = await prisma.jiraIntegration.findUnique({
    where: { organizationId: orgId },
    select: {
      siteUrl: true,
      createdAt: true,
      connectedBy: { select: { name: true } },
    },
  });

  if (!integration) {
    return NextResponse.json({
      configured: true,
      connected: false,
      siteUrl: null,
      connectedBy: null,
    });
  }

  return NextResponse.json({
    configured: true,
    connected: true,
    siteUrl: integration.siteUrl,
    connectedBy: integration.connectedBy.name,
    connectedAt: integration.createdAt,
  });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as Record<string, unknown>).role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can disconnect Jira" }, { status: 403 });
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  await prisma.$transaction([
    prisma.jiraUserMapping.deleteMany({ where: { organizationId: orgId } }),
    prisma.jiraIntegration.deleteMany({ where: { organizationId: orgId } }),
  ]);

  return NextResponse.json({ success: true });
}

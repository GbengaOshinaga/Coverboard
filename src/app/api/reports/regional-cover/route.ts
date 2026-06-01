import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeatureForEnum } from "@/lib/planFeatures";
import { computeRegionalCover } from "@/lib/regional-cover-analytics";
import { recordReadAudit, requestAuditContext } from "@/lib/audit";
import type { AnyPlan } from "@/lib/plans";

/**
 * Regional cover analytics — Scale tier feature.
 *
 * Returns per-region weekly under-cover stats across the trailing 13
 * weeks. Surfaces the aggregate "your London region was below minCover
 * 8 days this quarter" signal that per-leave warnings can't reveal.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  const plan = sessionUser.plan as AnyPlan | undefined;

  if (!hasFeatureForEnum(plan ?? null, "absence_analytics")) {
    return NextResponse.json(
      { error: "Regional cover analytics are available on the Scale plan." },
      { status: 403 }
    );
  }

  // Org must have regions enabled.
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { regionsEnabled: true },
  });
  if (!org?.regionsEnabled) {
    return NextResponse.json({
      regionsEnabled: false,
      regions: [],
      weeksBack: 13,
      generatedAt: new Date().toISOString(),
    });
  }

  const now = new Date();
  const thirteenWeeksAgo = new Date(now.getTime() - 13 * 7 * 24 * 60 * 60 * 1000);

  const [regions, leaves] = await Promise.all([
    prisma.region.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        minCover: true,
        members: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: orgId },
        status: "APPROVED",
        endDate: { gte: thirteenWeeksAgo },
      },
      select: { userId: true, startDate: true, endDate: true },
    }),
  ]);

  const report = computeRegionalCover(
    regions.map((r) => ({
      id: r.id,
      name: r.name,
      minCover: r.minCover,
      memberIds: r.members.map((m) => m.id),
    })),
    leaves,
    { now }
  );

  void recordReadAudit({
    plan: plan ?? null,
    organizationId: orgId,
    action: "compliance_report.viewed",
    resource: "compliance_report",
    actor: {
      id: sessionUser.id as string,
      email: (session.user.email as string | null) ?? null,
      role: userRole,
    },
    metadata: {
      report: "regional-cover",
      regionsAnalysed: regions.length,
      leavesAnalysed: leaves.length,
    },
    context: requestAuditContext(request),
  });

  return NextResponse.json({
    regionsEnabled: true,
    generatedAt: now.toISOString(),
    weeksBack: 13,
    regions: report,
  });
}

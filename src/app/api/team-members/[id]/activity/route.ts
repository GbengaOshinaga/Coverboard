import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAuditTrail, type AnyPlan } from "@/lib/plans";
import { recordReadAudit, requestAuditContext } from "@/lib/audit";

/**
 * Per-employee activity log. Returns audit entries scoped to a single
 * member — both direct events on the team_member resource and events on
 * leave requests belonging to that member. Admin-only, Pro-plan-gated.
 *
 * Cursor-paginated. Query params:
 *   - limit:  page size (default 50, max 500)
 *   - cursor: id of the last record on the previous page
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: memberId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const orgId = sessionUser.organizationId as string;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });
  if (!hasAuditTrail(org?.plan)) {
    return NextResponse.json(
      { error: "Activity log is available on the Pro plan." },
      { status: 403 }
    );
  }

  // Confirm the member belongs to this org. We do this before reading any
  // audit entries so a wrong-org id can't be used to enumerate the table.
  const member = await prisma.user.findFirst({
    where: { id: memberId, organizationId: orgId },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50),
    500
  );

  // Collect leave-request ids for this member so we can include audit
  // entries that target them (created/approved/rejected/sickness-viewed
  // etc.). We don't expect this set to be huge — even a long-tenured
  // employee will have under a few hundred entries.
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: { userId: memberId },
    select: { id: true },
  });
  const leaveRequestIds = leaveRequests.map((r) => r.id);

  const where = {
    organizationId: orgId,
    OR: [
      { resource: "team_member" as const, resourceId: memberId },
      ...(leaveRequestIds.length > 0
        ? [
            {
              resource: "leave_request" as const,
              resourceId: { in: leaveRequestIds },
            },
          ]
        : []),
    ],
  };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = logs.length > limit;
  const page = hasMore ? logs.slice(0, limit) : logs;

  // Self-referential: viewing someone's activity log is itself a sensitive
  // read. The plan check above guarantees this write goes through.
  void recordReadAudit({
    plan: sessionUser.plan as AnyPlan | undefined,
    organizationId: orgId,
    action: "team_member.viewed",
    resource: "team_member",
    resourceId: memberId,
    actor: {
      id: sessionUser.id as string,
      email: (session.user.email as string | null) ?? null,
      role: sessionUser.role as string,
    },
    metadata: {
      via: "activity_log",
      returned: page.length,
      paginated: cursor !== null,
    },
    context: requestAuditContext(request),
  });

  return NextResponse.json({
    logs: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

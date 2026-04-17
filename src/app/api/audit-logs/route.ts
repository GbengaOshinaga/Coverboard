import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAuditTrail } from "@/lib/plans";

/**
 * Paginated audit log listing. Admin-only, Pro-plan-gated.
 *
 * Query params:
 * - action: filter by exact action string
 * - resource: filter by resource type
 * - actorId: filter by actor user id
 * - from, to: ISO date range on createdAt
 * - limit: page size, default 100, max 1000
 * - cursor: id of the last record on the previous page
 */
export async function GET(request: Request) {
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
      { error: "Audit trail is available on the Pro plan." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const resource = searchParams.get("resource");
  const actorId = searchParams.get("actorId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100),
    1000
  );

  const where: Record<string, unknown> = { organizationId: orgId };
  if (action) where.action = action;
  if (resource) where.resource = resource;
  if (actorId) where.actorId = actorId;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    where.createdAt = range;
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = logs.length > limit;
  const page = hasMore ? logs.slice(0, limit) : logs;

  return NextResponse.json({
    logs: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

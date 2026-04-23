/**
 * GDPR Article 5(1)(e) data retention.
 *
 * Leave records and audit logs older than `retentionYears` (default 6) are
 * anonymised rather than deleted, so aggregate reporting remains valid while
 * personal identifiers are removed. Sickness notes (Article 9 special-category
 * data) are always wiped when a record is anonymised regardless of age.
 *
 * Only ADMIN users may invoke this endpoint. The `dryRun=true` query param
 * returns counts without making changes.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, requestAuditContext } from "@/lib/audit";

const DEFAULT_RETENTION_YEARS = 6;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — ADMIN only" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "true";
  const retentionYears = Number(searchParams.get("retentionYears") ?? DEFAULT_RETENTION_YEARS);

  if (retentionYears < 1 || retentionYears > 20) {
    return NextResponse.json({ error: "retentionYears must be between 1 and 20" }, { status: 400 });
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears);

  // Identify leave requests older than the retention cutoff for this org.
  const staleRequests = await prisma.leaveRequest.findMany({
    where: {
      user: { organizationId: orgId },
      endDate: { lt: cutoff },
    },
    select: { id: true },
  });

  // Identify audit logs older than retention cutoff for this org.
  const staleAuditLogs = await prisma.auditLog.findMany({
    where: {
      organizationId: orgId,
      createdAt: { lt: cutoff },
    },
    select: { id: true },
  });

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      cutoff,
      retentionYears,
      leaveRequestsToAnonymise: staleRequests.length,
      auditLogsToAnonymise: staleAuditLogs.length,
    });
  }

  // Anonymise leave requests: strip personal note, sickness note, and
  // unlink the reviewer. Statutory fields (dates, type, SSP/SMP figures)
  // are preserved for payroll audit purposes.
  const leaveIds = staleRequests.map((r) => r.id);
  let anonymisedLeave = 0;
  if (leaveIds.length > 0) {
    const result = await prisma.leaveRequest.updateMany({
      where: { id: { in: leaveIds } },
      data: {
        note: null,
        sicknessNote: null,
      },
    });
    anonymisedLeave = result.count;
  }

  // Anonymise audit logs: strip actor email and IP address.
  const auditIds = staleAuditLogs.map((l) => l.id);
  let anonymisedAudit = 0;
  if (auditIds.length > 0) {
    const result = await prisma.auditLog.updateMany({
      where: { id: { in: auditIds } },
      data: {
        actorEmail: null,
        ipAddress: null,
        userAgent: null,
      },
    });
    anonymisedAudit = result.count;
  }

  recordAudit({
    organizationId: orgId,
    action: "data_retention.anonymised",
    resource: "data_retention",
    actor: {
      id: sessionUser.id as string,
      email: sessionUser.email as string,
      role: sessionUser.role as string,
    },
    metadata: {
      cutoff,
      retentionYears,
      anonymisedLeave,
      anonymisedAudit,
    },
    context: requestAuditContext(request),
  });

  return NextResponse.json({
    cutoff,
    retentionYears,
    anonymisedLeave,
    anonymisedAudit,
  });
}

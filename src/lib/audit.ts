import { prisma } from "@/lib/prisma";
import { hasAuditTrail, type AnyPlan } from "@/lib/plans";

/**
 * Canonical audit actions. Extend this list rather than passing strings ad-hoc
 * so the viewer/filter UI can remain consistent.
 *
 * `.viewed` actions are emitted by `recordReadAudit` (Pro-only) and represent
 * sensitive reads — opening an individual employee profile, loading a leave
 * request that carries a sickness note, opening the audit log itself, or
 * pulling a compliance report.
 */
export const AUDIT_ACTIONS = [
  "leave_request.created",
  "leave_request.approved",
  "leave_request.rejected",
  "leave_request.cancelled",
  "leave_request.kit_days_updated",
  "leave_request.ssp_cap_reached",
  "leave_request.cover_overridden",
  "leave_request.sickness_viewed",
  "team_member.created",
  "team_member.updated",
  "team_member.deleted",
  "team_member.role_changed",
  "team_member.bulk_imported",
  "team_member.viewed",
  "leave_type.created",
  "leave_type.updated",
  "leave_type.deleted",
  "leave_policy.created",
  "leave_policy.updated",
  "leave_policy.deleted",
  "organization.settings_updated",
  "carry_over.rollover_run",
  "onboarding.completed",
  "data_retention.anonymised",
  "data_export.sar",
  "audit_log.viewed",
  "compliance_report.viewed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Canonical resource types. Keep in sync with `AUDIT_ACTIONS`.
 */
export type AuditResource =
  | "leave_request"
  | "team_member"
  | "leave_type"
  | "leave_policy"
  | "organization"
  | "carry_over"
  | "onboarding"
  | "data_retention"
  | "audit_log"
  | "compliance_report";

export type AuditActor = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
};

export type AuditContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Record an audit log entry. Never throws — audit failures must not break the
 * originating request. Fire-and-forget is acceptable; the returned promise can
 * be awaited if ordering matters.
 */
export async function recordAudit(params: {
  organizationId: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string | null;
  actor?: AuditActor;
  metadata?: Record<string, unknown>;
  context?: AuditContext;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actor?.id ?? null,
        actorEmail: params.actor?.email ?? null,
        actorRole: params.actor?.role ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata
          ? (params.metadata as object)
          : undefined,
        ipAddress: params.context?.ipAddress ?? null,
        userAgent: params.context?.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}

/**
 * Record a read-side audit entry. Only writes when the org's plan grants the
 * audit trail feature (currently Pro). For plans that can't view the audit
 * log there's no benefit to storing entries they can't see — and storing them
 * anyway raises its own data-minimisation concern under GDPR.
 */
export async function recordReadAudit(params: {
  plan: AnyPlan | null | undefined;
  organizationId: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string | null;
  actor?: AuditActor;
  metadata?: Record<string, unknown>;
  context?: AuditContext;
}): Promise<void> {
  if (!hasAuditTrail(params.plan)) return;
  const { plan: _plan, ...rest } = params;
  void _plan;
  return recordAudit(rest);
}

/**
 * Builds metadata for `leave_request.sickness_viewed` when a list-style read
 * has returned leave requests carrying a sickness note. Returns null when no
 * audit entry should be written — either the viewer is the leave subject
 * themselves (viewing your own sickness is not a sensitive read) or no
 * sickness-bearing requests were exposed.
 */
export function selectSicknessAuditMeta<
  T extends { id: string; userId: string; sicknessNote?: string | null }
>(
  requests: T[],
  viewerUserId: string,
  viewerRole: string
): { leaveRequestIds: string[]; count: number } | null {
  if (viewerRole !== "ADMIN" && viewerRole !== "MANAGER") return null;
  const exposed = requests
    .filter((r) => r.sicknessNote != null && r.sicknessNote !== "")
    .filter((r) => r.userId !== viewerUserId)
    .map((r) => r.id);
  if (exposed.length === 0) return null;
  return { leaveRequestIds: exposed, count: exposed.length };
}

/** Extract request IP + user-agent for audit context. */
export function requestAuditContext(request: Request): AuditContext {
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  return {
    ipAddress,
    userAgent: request.headers.get("user-agent"),
  };
}

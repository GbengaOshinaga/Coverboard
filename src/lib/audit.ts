import { prisma } from "@/lib/prisma";

/**
 * Canonical audit actions. Extend this list rather than passing strings ad-hoc
 * so the viewer/filter UI can remain consistent.
 */
export const AUDIT_ACTIONS = [
  "leave_request.created",
  "leave_request.approved",
  "leave_request.rejected",
  "leave_request.cancelled",
  "leave_request.kit_days_updated",
  "team_member.created",
  "team_member.updated",
  "team_member.deleted",
  "team_member.role_changed",
  "leave_type.created",
  "leave_type.updated",
  "leave_type.deleted",
  "leave_policy.created",
  "leave_policy.updated",
  "leave_policy.deleted",
  "organization.settings_updated",
  "carry_over.rollover_run",
  "onboarding.completed",
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
  | "onboarding";

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

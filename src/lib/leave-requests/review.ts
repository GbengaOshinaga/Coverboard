import { prisma } from "@/lib/prisma";
import { notifyRequestStatusChange } from "@/lib/slack-notifications";
import { emailRequestStatusChange } from "@/lib/email-notifications";
import { recordAudit, type AuditContext, type AuditAction } from "@/lib/audit";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import {
  calculateSMPPhaseDates,
  calculateSMPPhaseRates,
  getAweForUser,
  isMaternityLeaveType,
} from "@/lib/smpCalculator";
import { calculateBradfordFactor } from "@/lib/uk-compliance";
import { countWeekdays } from "@/lib/utils";

/**
 * Shared core for approving/rejecting a leave request. Used by both the web API
 * (PATCH /api/leave-requests/[id]) and the Slack interactive approve/reject
 * buttons, so the two paths can't diverge on the segregation-of-duties guard,
 * SMP backfill, Bradford recompute, notifications, audit, or analytics.
 *
 * The web route keeps owning CANCELLED, KIT-day edits, and response redaction;
 * this function is only the approve/reject decision.
 */

export type ReviewDecision = "APPROVED" | "REJECTED";

export type ReviewActor = {
  id: string;
  name: string;
  email: string | null;
  role: string;
};

export type ReviewLeaveInput = {
  requestId: string;
  decision: ReviewDecision;
  reviewer: ReviewActor;
  organizationId: string;
  coverOverride?: boolean;
  context?: AuditContext;
};

export type ReviewLeaveResult =
  | {
      ok: true;
      request: {
        id: string;
        status: ReviewDecision;
        userName: string;
        userEmail: string;
        leaveTypeName: string;
        startDate: Date;
        endDate: Date;
        daysRequested: number;
      };
    }
  | {
      ok: false;
      code: "forbidden" | "not_found" | "wrong_org" | "not_pending" | "self_approval";
      message: string;
      currentStatus?: string;
    };

export async function reviewLeaveRequest(
  input: ReviewLeaveInput
): Promise<ReviewLeaveResult> {
  const { requestId, decision, reviewer, organizationId, coverOverride, context } =
    input;

  if (reviewer.role !== "ADMIN" && reviewer.role !== "MANAGER") {
    return {
      ok: false,
      code: "forbidden",
      message: "Only admins and managers can approve or reject leave requests.",
    };
  }

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { name: true, email: true, organizationId: true } },
      leaveType: { select: { name: true } },
    },
  });

  if (!leaveRequest) {
    return { ok: false, code: "not_found", message: "Leave request not found." };
  }

  // Always scope to the actor's org — this closes an IDOR where a request id
  // from another org could be actioned.
  if (leaveRequest.user.organizationId !== organizationId) {
    return {
      ok: false,
      code: "wrong_org",
      message: "This leave request does not belong to your organization.",
    };
  }

  if (leaveRequest.status !== "PENDING") {
    return {
      ok: false,
      code: "not_pending",
      message: `This request has already been ${leaveRequest.status.toLowerCase()}.`,
      currentStatus: leaveRequest.status,
    };
  }

  // Segregation of duties: you can't approve or reject your own request when
  // another approver exists. A sole admin/manager may, to avoid a deadlock.
  if (leaveRequest.userId === reviewer.id) {
    const otherApprovers = await prisma.user.count({
      where: {
        organizationId,
        id: { not: reviewer.id },
        role: { in: ["ADMIN", "MANAGER"] },
      },
    });
    if (otherApprovers > 0) {
      return {
        ok: false,
        code: "self_approval",
        message:
          "You can't approve or reject your own request — ask another admin or manager.",
      };
    }
  }

  const updateData: Record<string, unknown> = {
    status: decision,
    reviewedById: reviewer.id,
    reviewedAt: new Date(),
  };

  // Back-fill SMP phase data for maternity requests created before the
  // SMP phase-tracking feature landed. No-ops when fields are already set.
  if (
    isMaternityLeaveType(leaveRequest.leaveType.name) &&
    leaveRequest.smpPhase1EndDate === null
  ) {
    const phases = calculateSMPPhaseDates(leaveRequest.startDate);
    updateData.smpPhase1EndDate = phases.phase1EndDate;
    updateData.smpPhase2EndDate = phases.phase2EndDate;
    if (leaveRequest.smpAverageWeeklyEarnings === null) {
      try {
        const awe = await getAweForUser(
          leaveRequest.userId,
          leaveRequest.startDate
        );
        if (awe !== null) {
          const rates = calculateSMPPhaseRates(awe);
          updateData.smpAverageWeeklyEarnings = awe;
          updateData.smpPhase1WeeklyRate = rates.phase1Weekly;
          updateData.smpPhase2WeeklyRate = rates.phase2Weekly;
        }
      } catch (err) {
        console.error("SMP backfill failed:", err);
      }
    }
  }

  if (decision === "APPROVED" && coverOverride === true) {
    updateData.coverOverride = true;
    updateData.coverOverrideById = reviewer.id;
    updateData.coverOverrideAt = new Date();
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: requestId },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      leaveType: { select: { name: true, category: true } },
    },
  });

  const daysRequested = countWeekdays(updated.startDate, updated.endDate);

  // Bradford Factor recompute on any sickness status change.
  if (/SSP|Sick/i.test(leaveRequest.leaveType.name)) {
    prisma.leaveRequest
      .findMany({
        where: {
          userId: leaveRequest.userId,
          OR: [
            { leaveType: { name: { contains: "SSP" } } },
            { leaveType: { name: { contains: "Sick" } } },
          ],
          status: "APPROVED",
        },
        select: { startDate: true, endDate: true },
      })
      .then((sickRequests) => {
        const spells = sickRequests.length;
        const days = sickRequests.reduce(
          (sum, r) => sum + countWeekdays(r.startDate, r.endDate),
          0
        );
        const score = calculateBradfordFactor(spells, days);
        return prisma.user.update({
          where: { id: leaveRequest.userId },
          data: { bradfordScore: score },
        });
      })
      .catch((err) => console.error("Bradford Factor update error:", err));
  }

  // Notifications (fire and forget).
  notifyRequestStatusChange({
    organizationId,
    requesterEmail: updated.user.email,
    status: decision,
    leaveTypeName: updated.leaveType.name,
    startDate: updated.startDate,
    endDate: updated.endDate,
    reviewerName: reviewer.name,
  }).catch((err) => console.error("Slack notification error:", err));

  emailRequestStatusChange({
    requesterEmail: updated.user.email,
    requesterName: updated.user.name,
    status: decision,
    leaveTypeName: updated.leaveType.name,
    startDate: updated.startDate,
    endDate: updated.endDate,
    reviewerName: reviewer.name,
  }).catch((err) => console.error("Email notification error:", err));

  const actor = { id: reviewer.id, email: reviewer.email, role: reviewer.role };
  const action = (
    {
      APPROVED: "leave_request.approved",
      REJECTED: "leave_request.rejected",
    } as Record<ReviewDecision, AuditAction>
  )[decision];

  recordAudit({
    organizationId,
    action,
    resource: "leave_request",
    resourceId: requestId,
    actor,
    metadata: {
      requesterEmail: updated.user.email,
      leaveType: updated.leaveType.name,
      startDate: updated.startDate,
      endDate: updated.endDate,
      ...(decision === "APPROVED" && coverOverride === true
        ? { coverOverride: true }
        : {}),
    },
    context,
  });

  if (decision === "APPROVED" && coverOverride === true) {
    recordAudit({
      organizationId,
      action: "leave_request.cover_overridden",
      resource: "leave_request",
      resourceId: requestId,
      actor,
      metadata: {
        requesterEmail: updated.user.email,
        leaveType: updated.leaveType.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
      },
      context,
    });
  }

  if (decision === "APPROVED") {
    trackServer(
      AnalyticsEvents.LEAVE_REQUEST_APPROVED,
      {
        cover_override: coverOverride === true,
        is_statutory: /SSP|Statutory/i.test(updated.leaveType.name),
        leave_category: updated.leaveType.category,
      },
      { userId: reviewer.id, organizationId, role: reviewer.role }
    );

    // Activation milestone (time-to-value): the first approved request in an
    // org with a real team means it's experienced the full loop. Fires at most
    // once per org. Fire-and-forget.
    void (async () => {
      try {
        const [approvedCount, memberCount, org] = await Promise.all([
          prisma.leaveRequest.count({
            where: { user: { organizationId }, status: "APPROVED" },
          }),
          prisma.user.count({ where: { organizationId } }),
          prisma.organization.findUnique({
            where: { id: organizationId },
            select: { createdAt: true },
          }),
        ]);
        if (approvedCount === 1 && memberCount > 1 && org) {
          trackServer(
            AnalyticsEvents.ORG_ACTIVATED,
            {
              time_to_activate_hours: Math.round(
                (Date.now() - org.createdAt.getTime()) / 3_600_000
              ),
            },
            { userId: reviewer.id, organizationId, role: reviewer.role }
          );
        }
      } catch (err) {
        console.error("Activation milestone tracking failed:", err);
      }
    })();
  }

  return {
    ok: true,
    request: {
      id: updated.id,
      status: decision,
      userName: updated.user.name,
      userEmail: updated.user.email,
      leaveTypeName: updated.leaveType.name,
      startDate: updated.startDate,
      endDate: updated.endDate,
      daysRequested,
    },
  };
}

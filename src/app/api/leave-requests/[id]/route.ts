import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyRequestStatusChange } from "@/lib/slack-notifications";
import { emailRequestStatusChange } from "@/lib/email-notifications";
import { recordAudit, requestAuditContext, type AuditAction } from "@/lib/audit";
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
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]).optional(),
  kitDaysUsed: z.number().int().min(0).max(20).optional(),
  splitDaysUsed: z.number().int().min(0).max(20).optional(),
  evidenceProvided: z.boolean().optional(),
  splCurtailmentConfirmed: z.boolean().optional(),
  coverOverride: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sessionUser = session.user as Record<string, unknown>;
  const userId = sessionUser.id as string;
  const userRole = sessionUser.role as string;
  const actorEmail = sessionUser.email as string | undefined;
  const orgId = sessionUser.organizationId as string;

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { status, kitDaysUsed, splitDaysUsed, evidenceProvided, splCurtailmentConfirmed, coverOverride } = parsed.data;

    if (coverOverride !== undefined && userRole !== "ADMIN" && userRole !== "MANAGER") {
      return NextResponse.json(
        { error: "Only admins and managers can override cover" },
        { status: 403 }
      );
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: true, leaveType: { select: { name: true } } },
    });

    if (!leaveRequest) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      );
    }

    if (status === "CANCELLED") {
      if (leaveRequest.userId !== userId) {
        return NextResponse.json(
          { error: "Only the requester can cancel their leave" },
          { status: 403 }
        );
      }
    } else if (status) {
      if (userRole !== "ADMIN" && userRole !== "MANAGER") {
        return NextResponse.json(
          { error: "Only admins and managers can approve or reject leave" },
          { status: 403 }
        );
      }
      // Segregation of duties: you can't approve or reject your own request
      // when another approver exists. A sole admin/manager may, to avoid a
      // deadlock (e.g. a solo owner with no one else to approve).
      if (
        (status === "APPROVED" || status === "REJECTED") &&
        leaveRequest.userId === userId
      ) {
        const otherApprovers = await prisma.user.count({
          where: {
            organizationId: orgId,
            id: { not: userId },
            role: { in: ["ADMIN", "MANAGER"] },
          },
        });
        if (otherApprovers > 0) {
          return NextResponse.json(
            {
              error:
                "You can't approve or reject your own request — ask another admin or manager.",
            },
            { status: 403 }
          );
        }
      }
    }

    if ((kitDaysUsed !== undefined || splitDaysUsed !== undefined || evidenceProvided !== undefined || splCurtailmentConfirmed !== undefined) && !status) {
      if (userRole !== "ADMIN" && userRole !== "MANAGER") {
        return NextResponse.json(
          { error: "Only admins and managers can edit KIT days or evidence" },
          { status: 403 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status) {
      updateData.status = status;
      if (status !== "CANCELLED") {
        updateData.reviewedById = userId;
        updateData.reviewedAt = new Date();
      }
    }
    if (kitDaysUsed !== undefined) updateData.kitDaysUsed = kitDaysUsed;
    if (splitDaysUsed !== undefined) updateData.splitDaysUsed = splitDaysUsed;
    if (evidenceProvided !== undefined) updateData.evidenceProvided = evidenceProvided;
    if (splCurtailmentConfirmed !== undefined) updateData.splCurtailmentConfirmed = splCurtailmentConfirmed;

    if (status === "APPROVED" && coverOverride === true) {
      updateData.coverOverride = true;
      updateData.coverOverrideById = userId;
      updateData.coverOverrideAt = new Date();
    }

    // Back-fill SMP phase data for maternity requests created before the
    // SMP phase-tracking feature landed. Runs on any approval/rejection/
    // admin edit as a safety-net; no-ops when fields are already set.
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

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            countryCode: true,
            memberType: true,
          },
        },
        leaveType: {
          select: { id: true, name: true, color: true, category: true, isPaid: true },
        },
        reviewedBy: {
          select: { id: true, name: true },
        },
      },
    });

    // ── Bradford Factor recalculation on any sickness status change ───
    // Recompute whenever a sickness/SSP request changes status — not just
    // on APPROVED — so downgrades (APPROVED → REJECTED/CANCELLED) also
    // clear stale score contributions. The query itself filters to
    // APPROVED rows, so the recount stays correct.
    if (
      status !== undefined &&
      /SSP|Sick/i.test(leaveRequest.leaveType.name)
    ) {
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

    // Send notifications (fire and forget)
    if (status === "APPROVED" || status === "REJECTED") {
      notifyRequestStatusChange({
        organizationId: leaveRequest.user.organizationId,
        requesterEmail: updated.user.email,
        status,
        leaveTypeName: updated.leaveType.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
        reviewerName: updated.reviewedBy?.name ?? "Unknown",
      }).catch((err) => console.error("Slack notification error:", err));

      emailRequestStatusChange({
        requesterEmail: updated.user.email,
        requesterName: updated.user.name,
        status,
        leaveTypeName: updated.leaveType.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
        reviewerName: updated.reviewedBy?.name ?? "Unknown",
      }).catch((err) => console.error("Email notification error:", err));
    }

    const actor = {
      id: userId,
      email: actorEmail ?? null,
      role: userRole,
    };
    const ctx = requestAuditContext(request);
    if (status) {
      const action = (
        {
          APPROVED: "leave_request.approved",
          REJECTED: "leave_request.rejected",
          CANCELLED: "leave_request.cancelled",
        } as Record<string, AuditAction>
      )[status];
      if (action) {
        recordAudit({
          organizationId: orgId,
          action,
          resource: "leave_request",
          resourceId: id,
          actor,
          metadata: {
            requesterEmail: updated.user.email,
            leaveType: updated.leaveType.name,
            startDate: updated.startDate,
            endDate: updated.endDate,
            ...(status === "APPROVED" && coverOverride === true
              ? { coverOverride: true }
              : {}),
          },
          context: ctx,
        });
        if (status === "APPROVED") {
          trackServer(
            AnalyticsEvents.LEAVE_REQUEST_APPROVED,
            {
              cover_override: coverOverride === true,
              is_statutory: /SSP|Statutory/i.test(updated.leaveType.name),
              leave_category: updated.leaveType.category,
            },
            {
              userId,
              organizationId: orgId,
              role: userRole,
            }
          );
        }
        if (status === "CANCELLED") {
          trackServer(
            AnalyticsEvents.LEAVE_REQUEST_CANCELLED,
            {
              is_statutory: /SSP|Statutory/i.test(updated.leaveType.name),
              leave_category: updated.leaveType.category,
            },
            {
              userId,
              organizationId: orgId,
              role: userRole,
            }
          );
        }
      }
      if (status === "APPROVED" && coverOverride === true) {
        recordAudit({
          organizationId: orgId,
          action: "leave_request.cover_overridden",
          resource: "leave_request",
          resourceId: id,
          actor,
          metadata: {
            requesterEmail: updated.user.email,
            leaveType: updated.leaveType.name,
            startDate: updated.startDate,
            endDate: updated.endDate,
          },
          context: ctx,
        });
      }
    }
    if ((kitDaysUsed !== undefined || splitDaysUsed !== undefined) && !status) {
      recordAudit({
        organizationId: orgId,
        action: "leave_request.kit_days_updated",
        resource: "leave_request",
        resourceId: id,
        actor,
        metadata: { kitDaysUsed, splitDaysUsed, requesterEmail: updated.user.email },
        context: ctx,
      });
    }

    // Sickness notes are sensitive: only the owner and admins receive the free
    // text. A manager acting on someone else's request gets it redacted.
    const responsePayload =
      updated.userId === userId || userRole === "ADMIN"
        ? updated
        : { ...updated, sicknessNote: null };
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("Update leave request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

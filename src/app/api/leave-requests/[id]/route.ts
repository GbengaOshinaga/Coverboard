import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailApprovedLeaveCancelled } from "@/lib/email-notifications";
import { recordAudit, requestAuditContext } from "@/lib/audit";
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
import { reviewLeaveRequest } from "@/lib/leave-requests/review";
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
  const actorName =
    (sessionUser.name as string | undefined) ?? actorEmail ?? "Unknown";
  const orgId = sessionUser.organizationId as string;

  const fullInclude = {
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
  } as const;

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

    // Approve/reject share their core with the Slack interactive buttons — the
    // segregation-of-duties guard, SMP backfill, Bradford recompute,
    // notifications, audit, and analytics all live in reviewLeaveRequest.
    if (status === "APPROVED" || status === "REJECTED") {
      const result = await reviewLeaveRequest({
        requestId: id,
        decision: status,
        reviewer: {
          id: userId,
          name: actorName,
          email: actorEmail ?? null,
          role: userRole,
        },
        organizationId: orgId,
        coverOverride,
        context: requestAuditContext(request),
      });

      if (!result.ok) {
        const httpStatus =
          result.code === "not_found"
            ? 404
            : result.code === "forbidden" || result.code === "wrong_org"
              ? 403
              : 400;
        return NextResponse.json({ error: result.message }, { status: httpStatus });
      }

      const updated = await prisma.leaveRequest.findUnique({
        where: { id },
        include: fullInclude,
      });
      if (!updated) {
        return NextResponse.json(
          { error: "Leave request not found" },
          { status: 404 }
        );
      }
      const responsePayload =
        updated.userId === userId || userRole === "ADMIN"
          ? updated
          : { ...updated, sicknessNote: null };
      return NextResponse.json(responsePayload);
    }

    // Remaining paths: CANCELLED (by the requester) and admin/manager field
    // edits (KIT days, evidence). These don't go through the review core.
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

    if (leaveRequest.user.organizationId !== orgId) {
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
      // You can't un-take leave that's already started — approved leave is only
      // cancellable while it's still upcoming. (Pending leave can always be
      // withdrawn, since it was never granted.)
      if (
        leaveRequest.status === "APPROVED" &&
        leaveRequest.startDate <= new Date()
      ) {
        return NextResponse.json(
          {
            error:
              "Approved leave that has already started can't be cancelled.",
          },
          { status: 403 }
        );
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
    if (status === "CANCELLED") {
      updateData.status = "CANCELLED";
    }
    if (kitDaysUsed !== undefined) updateData.kitDaysUsed = kitDaysUsed;
    if (splitDaysUsed !== undefined) updateData.splitDaysUsed = splitDaysUsed;
    if (evidenceProvided !== undefined) updateData.evidenceProvided = evidenceProvided;
    if (splCurtailmentConfirmed !== undefined) updateData.splCurtailmentConfirmed = splCurtailmentConfirmed;

    // Back-fill SMP phase data for maternity requests created before the
    // SMP phase-tracking feature landed; no-ops when fields are already set.
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
      include: fullInclude,
    });

    // ── Bradford Factor recalculation on a sickness status change ─────
    // Recompute on CANCELLED so a downgrade clears stale score contributions.
    // The query filters to APPROVED rows, so the recount stays correct.
    if (
      status === "CANCELLED" &&
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

    // When someone cancels leave that was already approved, let the other
    // approvers know — it frees up coverage they'd planned around.
    if (status === "CANCELLED" && leaveRequest.status === "APPROVED") {
      emailApprovedLeaveCancelled({
        cancellerName: updated.user.name,
        cancellerUserId: userId,
        leaveTypeName: updated.leaveType.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
        organizationId: leaveRequest.user.organizationId,
      }).catch((err) =>
        console.error("Cancellation notice email error:", err)
      );
    }

    const actor = {
      id: userId,
      email: actorEmail ?? null,
      role: userRole,
    };
    const ctx = requestAuditContext(request);
    if (status === "CANCELLED") {
      recordAudit({
        organizationId: orgId,
        action: "leave_request.cancelled",
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

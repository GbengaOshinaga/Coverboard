import { NextResponse } from "next/server";
import { keepingInTouchError } from "@/lib/keeping-in-touch";
import { recomputeBradfordScore } from "@/lib/leave-requests/bradford";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailApprovedLeaveCancelled } from "@/lib/email-notifications";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { birthPayKind, shppClaimError } from "@/lib/smp-dates";
import { computeSmpFields, isSharedParentalLeaveType } from "@/lib/smp-request";
import { reviewLeaveRequest } from "@/lib/leave-requests/review";
import { changeSicknessEndDate } from "@/lib/leave-requests/change-end-date";
import { isoDateSchema, isoDateToUtc } from "@/lib/validations";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]).optional(),
  kitDaysUsed: z.number().int().min(0).max(20).optional(),
  splitDaysUsed: z.number().int().min(0).max(20).optional(),
  evidenceProvided: z.boolean().optional(),
  splCurtailmentConfirmed: z.boolean().optional(),
  coverOverride: z.boolean().optional(),
  /** Sickness only: move the end date (off longer, or back early). */
  endDate: isoDateSchema.optional(),
  /** Maternity: the due date, added or corrected after booking (sets the qualifying week). */
  expectedDueDate: isoDateSchema.nullable().optional(),
  /** Adoption: when they were told of the match (sets the matching week). */
  matchedDate: isoDateSchema.nullable().optional(),
  /** Shared parental leave: whether their notice claims ShPP for these weeks. */
  shppClaimed: z.boolean().optional(),
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

    const { status, kitDaysUsed, splitDaysUsed, evidenceProvided, splCurtailmentConfirmed, coverOverride, endDate } = parsed.data;
    const { expectedDueDate, matchedDate, shppClaimed } = parsed.data;

    // Date changes stand alone so they can't be mixed with a status change.
    if (endDate !== undefined) {
      if (Object.keys(parsed.data).length > 1) {
        return NextResponse.json(
          { error: "Change the end date on its own" },
          { status: 400 }
        );
      }
      const result = await changeSicknessEndDate({
        requestId: id,
        newEndDate: isoDateToUtc(endDate),
        actor: { id: userId, email: actorEmail ?? null, role: userRole },
        organizationId: orgId,
        context: requestAuditContext(request),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      const updated = await prisma.leaveRequest.findUnique({
        where: { id },
        include: fullInclude,
      });
      const responsePayload =
        updated && (updated.userId === userId || userRole === "ADMIN")
          ? updated
          : { ...updated, sicknessNote: null };
      return NextResponse.json(responsePayload);
    }

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

    // KIT days only on maternity/adoption (max 10), SPLIT days only on shared
    // parental leave (max 20).
    if (kitDaysUsed !== undefined || splitDaysUsed !== undefined) {
      const kitProblem = keepingInTouchError(leaveRequest.leaveType.name, { kitDaysUsed, splitDaysUsed });
      if (kitProblem) {
        return NextResponse.json({ error: kitProblem }, { status: 400 });
      }
    }

    // The due date or matching date: the person on leave, or an admin or
    // manager, can add it after booking (often only known later). Only on
    // the leave type it belongs to.
    const payKind = birthPayKind(leaveRequest.leaveType.name);
    const isSpl = isSharedParentalLeaveType(leaveRequest.leaveType.name);
    const isPaternity = /paternity/i.test(leaveRequest.leaveType.name);
    const datesChanging = expectedDueDate !== undefined || matchedDate !== undefined;
    if (datesChanging || shppClaimed !== undefined) {
      if (leaveRequest.userId !== userId && userRole !== "ADMIN" && userRole !== "MANAGER") {
        return NextResponse.json({ error: "You can't change this request" }, { status: 403 });
      }
      // SPL and paternity can be for a birth (due date) or an adoption (matching date).
      if (
        !isSpl &&
        !isPaternity &&
        ((expectedDueDate !== undefined && payKind !== "SMP") || (matchedDate !== undefined && payKind !== "SAP"))
      ) {
        return NextResponse.json(
          { error: "A due date is for maternity leave, and a matching date for adoption leave." },
          { status: 400 }
        );
      }
      if (shppClaimed !== undefined && !isSpl) {
        return NextResponse.json({ error: "Shared Parental Pay is only for shared parental leave." }, { status: 400 });
      }
    }
    // Claiming ShPP: within the 37 weeks for the child.
    if (isSpl && (shppClaimed === true || (datesChanging && leaveRequest.shppClaimed))) {
      const due = expectedDueDate !== undefined ? (expectedDueDate ? isoDateToUtc(expectedDueDate) : null) : leaveRequest.expectedDueDate;
      const matched = matchedDate !== undefined ? (matchedDate ? isoDateToUtc(matchedDate) : null) : leaveRequest.matchedDate;
      if (!due && !matched) {
        return NextResponse.json(
          { error: "Add the baby's due date (birth) or the matching date (adoption) to claim Shared Parental Pay." },
          { status: 400 }
        );
      }
      const otherClaims = await prisma.leaveRequest.findMany({
        where: {
          userId: leaveRequest.userId,
          id: { not: leaveRequest.id },
          shppClaimed: true,
          status: { in: ["PENDING", "APPROVED"] },
          ...(matched ? { matchedDate: matched } : { expectedDueDate: due }),
        },
        select: { startDate: true, endDate: true },
      });
      const capError = shppClaimError({ request: leaveRequest, otherClaims });
      if (capError) return NextResponse.json({ error: capError }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (expectedDueDate !== undefined) updateData.expectedDueDate = expectedDueDate ? isoDateToUtc(expectedDueDate) : null;
    if (matchedDate !== undefined) updateData.matchedDate = matchedDate ? isoDateToUtc(matchedDate) : null;
    if (shppClaimed !== undefined) updateData.shppClaimed = shppClaimed;
    if (status === "CANCELLED") {
      updateData.status = "CANCELLED";
    }
    if (kitDaysUsed !== undefined) updateData.kitDaysUsed = kitDaysUsed;
    if (splitDaysUsed !== undefined) updateData.splitDaysUsed = splitDaysUsed;
    if (evidenceProvided !== undefined) updateData.evidenceProvided = evidenceProvided;
    if (splCurtailmentConfirmed !== undefined) updateData.splCurtailmentConfirmed = splCurtailmentConfirmed;

    // SMP or SAP: worked out again when its date changes, or filled in on
    // requests from before pay was tracked (src/lib/smp-request.ts).
    if (payKind && (datesChanging || leaveRequest.smpPhase1EndDate === null)) {
      try {
        const smp = await computeSmpFields({
          userId: leaveRequest.userId,
          startDate: leaveRequest.startDate,
          expectedDueDate:
            expectedDueDate !== undefined ? (expectedDueDate ? isoDateToUtc(expectedDueDate) : null) : leaveRequest.expectedDueDate,
          matchedDate: matchedDate !== undefined ? (matchedDate ? isoDateToUtc(matchedDate) : null) : leaveRequest.matchedDate,
          kind: payKind,
        });
        Object.assign(updateData, smp.fields);
      } catch (err) {
        console.error("SMP/SAP recalculation failed:", err);
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
      recomputeBradfordScore(leaveRequest.userId);
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

import { prisma } from "@/lib/prisma";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { emailSspCapReached } from "@/lib/email-notifications";
import { UK_SSP_WEEKLY_RATE, calculateBradfordFactor } from "@/lib/uk-compliance";
import { countWeekdays } from "@/lib/utils";
import { checkEndDateChange, rescaleHours } from "./rules";
import { computeSspForSpell } from "./ssp-spell";

export type ChangeEndDateResult =
  | { ok: true; requestId: string; userId: string; startDate: Date; endDate: Date }
  | { ok: false; status: number; error: string };

/**
 * Moves the end date of a sickness absence (someone's off longer, or back
 * early) and keeps everything derived from it in step: SSP days and the
 * 28-week cap, hours booked, the Bradford score, and the audit trail.
 */
export async function changeSicknessEndDate(input: {
  requestId: string;
  newEndDate: Date;
  actor: { id: string; email: string | null; role: string };
  organizationId: string;
  context?: AuditContext;
}): Promise<ChangeEndDateResult> {
  const { requestId, newEndDate, actor, organizationId, context } = input;

  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      userId: true,
      status: true,
      startDate: true,
      endDate: true,
      hoursBooked: true,
      sspDaysPaid: true,
      sspLimitReached: true,
      user: { select: { name: true, organizationId: true } },
      leaveType: { select: { name: true } },
    },
  });
  // Another org's request is reported as missing, not forbidden.
  if (!request || request.user.organizationId !== organizationId) {
    return { ok: false, status: 404, error: "Leave request not found" };
  }

  const check = checkEndDateChange({
    actorRole: actor.role,
    leaveTypeName: request.leaveType.name,
    status: request.status,
    startDate: request.startDate,
    oldEndDate: request.endDate,
    newEndDate,
  });
  if (!check.ok) return check;

  const isSsp = request.leaveType.name.includes("SSP");
  const ssp = isSsp
    ? await computeSspForSpell({
        userId: request.userId,
        startDate: request.startDate,
        endDate: newEndDate,
      })
    : null;

  const oldDays = countWeekdays(request.startDate, request.endDate);
  const newDays = countWeekdays(request.startDate, newEndDate);

  const updated = await prisma.leaveRequest.update({
    where: { id: requestId },
    data: {
      endDate: newEndDate,
      hoursBooked: rescaleHours(request.hoursBooked, oldDays, newDays),
      ...(ssp ? { sspDaysPaid: ssp.sspDaysPaid, sspLimitReached: ssp.sspLimitReached } : {}),
    },
    select: { id: true, userId: true, startDate: true, endDate: true },
  });

  // Same recount as create/review: approved sickness spells and their days.
  if (request.status === "APPROVED") {
    prisma.leaveRequest
      .findMany({
        where: {
          userId: request.userId,
          OR: [
            { leaveType: { name: { contains: "SSP" } } },
            { leaveType: { name: { contains: "Sick" } } },
          ],
          status: "APPROVED",
        },
        select: { startDate: true, endDate: true },
      })
      .then((sick) => {
        const days = sick.reduce((sum, r) => sum + countWeekdays(r.startDate, r.endDate), 0);
        return prisma.user.update({
          where: { id: request.userId },
          data: { bradfordScore: calculateBradfordFactor(sick.length, days) },
        });
      })
      .catch((err) => console.error("Bradford Factor update error:", err));
  }

  const actorMeta = { id: actor.id, email: actor.email, role: actor.role };
  recordAudit({
    organizationId,
    action: "leave_request.dates_changed",
    resource: "leave_request",
    resourceId: requestId,
    actor: actorMeta,
    metadata: {
      employee: { id: request.userId, name: request.user.name },
      leaveType: request.leaveType.name,
      startDate: request.startDate,
      oldEndDate: request.endDate,
      newEndDate,
      ...(ssp ? { sspDaysPaidBefore: request.sspDaysPaid, sspDaysPaidAfter: ssp.sspDaysPaid } : {}),
    },
    context,
  });

  // Only when this change is what reaches the cap, not on every later edit.
  if (ssp?.capReachedNow && !request.sspLimitReached) {
    emailSspCapReached({
      employeeName: ssp.employee.name,
      sspEndDate: newEndDate,
      organizationId,
    }).catch((err) => console.error("SSP cap reached email error:", err));
    recordAudit({
      organizationId,
      action: "leave_request.ssp_cap_reached",
      resource: "leave_request",
      resourceId: requestId,
      actor: actorMeta,
      metadata: {
        employee: ssp.employee.name,
        sspEndDate: newEndDate,
        weeklyRate: UK_SSP_WEEKLY_RATE,
        cumulativeDays: ssp.info.cumulativeSspDaysPaid,
      },
      context,
    });
  }

  return {
    ok: true,
    requestId: updated.id,
    userId: updated.userId,
    startDate: updated.startDate,
    endDate: updated.endDate,
  };
}

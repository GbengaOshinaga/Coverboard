import { prisma } from "@/lib/prisma";
import { getUserLeaveBalance } from "@/lib/leave-balances";
import { countWeekdays } from "@/lib/utils";
import { notifyNewRequest } from "@/lib/slack-notifications";
import { emailNewRequest, emailSspCapReached } from "@/lib/email-notifications";
import {
  SSP_MAX_WEEKS,
  calculateSspPayableDaysForSpell,
  calculateSspEntitlement,
  UK_SSP_WEEKLY_RATE,
  calculateBradfordFactor,
} from "@/lib/uk-compliance";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { getDailyHolidayPayRateForUser } from "@/lib/holidayPay";
import {
  calculateSMPPhaseDates,
  calculateSMPPhaseRates,
  getAweForUser,
  isMaternityLeaveType,
  resolveAverageWeeklyEarnings,
} from "@/lib/smpCalculator";

/**
 * Shared core for creating a leave request. Used by both the web API
 * (POST /api/leave-requests) and the Slack `/requestleave` slash command so
 * the two paths never diverge on statutory logic, auto-approval, notifications,
 * audit, or analytics. HTTP/session concerns stay in the route; this function
 * only takes a resolved actor + already-parsed values.
 */

export type CreateLeaveActor = {
  id: string;
  email: string | null;
  role: string;
  plan?: string;
};

export type CreateLeaveInput = {
  actor: CreateLeaveActor;
  organizationId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  note?: string;
  sicknessNote?: string;
  evidenceProvided?: boolean;
  kitDaysUsed?: number;
  splitDaysUsed?: number;
  /** Hours to deduct (irregular/zero-hours workers). Derived if omitted. */
  hoursBooked?: number;
  childBirthDate?: Date;
  splCurtailmentConfirmed?: boolean;
  context?: AuditContext;
};

type SspInfo = {
  eligible: boolean;
  reason?: string;
  payableDays: number;
  sspDaysPaidThisRequest: number;
  cumulativeSspDaysPaid: number;
  dailyRate: number;
  estimatedCost: number;
  remainingDaysAfter: number;
  limitReached: boolean;
};

export type CreateLeaveResult =
  | {
      ok: true;
      request: Awaited<ReturnType<typeof createRequestRow>>;
      balanceWarning: string | null;
      sspInfo: SspInfo | null;
      firstRequest: boolean;
      autoApproved: boolean;
      daysRequested: number;
    }
  | { ok: false; status: number; error: string };

// Extracted so the return type above can reference the exact include shape.
function createRequestRow(data: Parameters<typeof prisma.leaveRequest.create>[0]["data"]) {
  return prisma.leaveRequest.create({
    data,
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
        select: { id: true, name: true, color: true },
      },
    },
  });
}

export async function createLeaveRequest(
  input: CreateLeaveInput
): Promise<CreateLeaveResult> {
  const {
    actor,
    organizationId: orgId,
    leaveTypeId,
    startDate,
    endDate,
    note,
    sicknessNote,
    evidenceProvided,
    kitDaysUsed,
    splitDaysUsed,
    childBirthDate,
    splCurtailmentConfirmed,
    context,
  } = input;
  const userId = actor.id;

  const leaveTypeConfig = await prisma.leaveType.findUnique({
    where: { id: leaveTypeId },
    select: {
      name: true,
      minNoticeDays: true,
      requiresEvidence: true,
      applyProRata: true,
      category: true,
      isPaid: true,
    },
  });
  if (!leaveTypeConfig) {
    return { ok: false, status: 404, error: "Leave type not found" };
  }
  const now = new Date();
  const noticeDays = Math.floor(
    (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (noticeDays < leaveTypeConfig.minNoticeDays) {
    return {
      ok: false,
      status: 400,
      error: `This leave type requires at least ${leaveTypeConfig.minNoticeDays} days notice`,
    };
  }
  const evidenceConfirmed =
    evidenceProvided === true ||
    (leaveTypeConfig.requiresEvidence &&
      typeof sicknessNote === "string" &&
      sicknessNote.trim().length > 0);

  if (leaveTypeConfig.requiresEvidence && !evidenceConfirmed) {
    return {
      ok: false,
      status: 400,
      error: "Evidence is required for this leave type",
    };
  }

  if (endDate < startDate) {
    return { ok: false, status: 400, error: "End date must be after start date" };
  }

  // Check leave balance (warn but don't block). For irregular/zero-hours
  // workers the relevant balance is measured in hours, so we resolve the hours
  // this request costs (explicit input, or working-days × their average day)
  // and warn in hours. `resolvedHoursBooked` is persisted on the request below;
  // it stays null for day-based balances.
  let balanceWarning: string | null = null;
  let resolvedHoursBooked: number | null = null;
  try {
    const requestedDays = countWeekdays(startDate, endDate);
    const balance = await getUserLeaveBalance(
      userId,
      leaveTypeId,
      startDate.getFullYear()
    );
    if (balance?.unit === "hours") {
      const avgHoursPerDay = balance.avgHoursPerDay ?? 0;
      resolvedHoursBooked =
        input.hoursBooked ?? Number((requestedDays * avgHoursPerDay).toFixed(2));
      if (resolvedHoursBooked > balance.remaining) {
        balanceWarning = `This request (${resolvedHoursBooked} hours) exceeds your remaining balance of ${balance.remaining.toFixed(1)} hours for ${balance.leaveTypeName}.`;
      }
    } else if (balance && requestedDays > balance.remaining) {
      balanceWarning = `This request (${requestedDays} days) exceeds your remaining balance of ${balance.remaining} days for ${balance.leaveTypeName}.`;
    }
  } catch {
    // Don't block request creation if balance check fails
  }

  // ── Paternity leave: must fall within 52 weeks of birth/placement ──
  // Post-2024 reform: leave can be taken any time in the first year (previously
  // 56 days), and the two weeks may be non-consecutive (each booked separately).
  const isPaternityLeave = /paternity/i.test(leaveTypeConfig.name);
  if (isPaternityLeave && childBirthDate) {
    const windowEnd = new Date(childBirthDate);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 364); // 52 weeks
    if (startDate > windowEnd) {
      return {
        ok: false,
        status: 400,
        error:
          "Paternity leave must start within 52 weeks of the child's birth or placement date",
      };
    }
  }

  // ── Unpaid Parental Leave: 4 weeks/year cap ────────────────────────
  const isUpl = /unpaid parental/i.test(leaveTypeConfig.name);
  if (isUpl) {
    const yearStart = new Date(Date.UTC(startDate.getUTCFullYear(), 0, 1));
    const yearEnd = new Date(
      Date.UTC(startDate.getUTCFullYear(), 11, 31, 23, 59, 59, 999)
    );
    const existingUpl = await prisma.leaveRequest.findMany({
      where: {
        userId,
        leaveType: { name: { contains: "Unpaid Parental" } },
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      select: { startDate: true, endDate: true },
    });
    const usedUplDays = existingUpl.reduce(
      (sum, r) => sum + countWeekdays(r.startDate, r.endDate),
      0
    );
    const requestedDays = countWeekdays(startDate, endDate);
    if (usedUplDays + requestedDays > 20) {
      return {
        ok: false,
        status: 400,
        error: `Unpaid Parental Leave is capped at 4 weeks (20 working days) per year. You have ${20 - usedUplDays} days remaining.`,
      };
    }
  }

  // For annual-leave requests, capture the 52-week average daily rate so
  // payroll has a legally compliant figure at the moment the request was
  // booked. Never block the request if this calculation fails.
  let dailyHolidayPayRate: number | null = null;
  if (leaveTypeConfig.applyProRata) {
    try {
      dailyHolidayPayRate = await getDailyHolidayPayRateForUser(userId);
    } catch (err) {
      console.error("Holiday pay rate calculation failed:", err);
    }
  }

  // ── SMP phase tracking ─────────────────────────────────────────────
  let smpAverageWeeklyEarnings: number | null = null;
  let smpPhase1WeeklyRate: number | null = null;
  let smpPhase2WeeklyRate: number | null = null;
  let smpPhase1EndDate: Date | null = null;
  let smpPhase2EndDate: Date | null = null;
  if (isMaternityLeaveType(leaveTypeConfig.name)) {
    try {
      smpAverageWeeklyEarnings = await getAweForUser(userId, startDate);
      if (smpAverageWeeklyEarnings !== null) {
        const rates = calculateSMPPhaseRates(smpAverageWeeklyEarnings);
        smpPhase1WeeklyRate = rates.phase1Weekly;
        smpPhase2WeeklyRate = rates.phase2Weekly;
      }
      const phases = calculateSMPPhaseDates(startDate);
      smpPhase1EndDate = phases.phase1EndDate;
      smpPhase2EndDate = phases.phase2EndDate;
    } catch (err) {
      console.error("SMP phase calculation failed:", err);
    }
  }

  // ── SSP eligibility & 28-week cap ──────────────────────────────────
  const isSspLeave = leaveTypeConfig.name.includes("SSP");
  const isSicknessLeave = isSspLeave || leaveTypeConfig.name.includes("Sick");
  let sspInfo: SspInfo | null = null;
  let sspDaysPaid = 0;
  let sspLimitReached = false;
  let notifyCapReached = false;
  let sspEmployeeSnapshot: { name: string; organizationId: string } | null = null;

  if (isSspLeave) {
    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        organizationId: true,
        qualifyingDaysPerWeek: true,
        averageWeeklyEarnings: true,
      },
    });
    if (employee) {
      sspEmployeeSnapshot = {
        name: employee.name,
        organizationId: employee.organizationId,
      };
      const piwFloor = new Date(startDate);
      piwFloor.setDate(piwFloor.getDate() - 56);
      const priorSsp = await prisma.leaveRequest.findMany({
        where: {
          userId,
          leaveType: { name: { contains: "SSP" } },
          endDate: { gte: piwFloor, lt: startDate },
        },
        select: { sspDaysPaid: true },
      });
      const cumulativePrior = priorSsp.reduce(
        (sum, r) => sum + (r.sspDaysPaid ?? 0),
        0
      );

      const averageWeeklyEarnings = await resolveAverageWeeklyEarnings(
        userId,
        startDate,
        employee.averageWeeklyEarnings === null
          ? null
          : Number(employee.averageWeeklyEarnings)
      );

      const entitlement = calculateSspEntitlement({
        averageWeeklyEarnings,
        sspDaysPaidInPeriod: cumulativePrior,
        qualifyingDaysPerWeek: employee.qualifyingDaysPerWeek,
        // Pick pre- vs post-6-April-2026 SSP rules by the spell's start date.
        onDate: startDate,
      });

      if (!entitlement.eligible) {
        sspInfo = {
          eligible: false,
          reason: entitlement.reason,
          payableDays: 0,
          sspDaysPaidThisRequest: 0,
          cumulativeSspDaysPaid: cumulativePrior,
          dailyRate: 0,
          estimatedCost: 0,
          remainingDaysAfter: Math.max(
            0,
            SSP_MAX_WEEKS * Number(employee.qualifyingDaysPerWeek ?? 5) -
              cumulativePrior
          ),
          limitReached: entitlement.reason === "SSP 28-week limit reached",
        };
      } else {
        // Waiting days are served once per PIW. A spell linked to a prior SSP
        // spell (one ending within the 56-day window queried above) has already
        // served them, so it pays every weekday with no 3-day deduction;
        // re-deducting would underpay the employee. See the helper for detail.
        const requestedPayable = calculateSspPayableDaysForSpell(
          startDate,
          endDate,
          { linkedToPriorPiw: priorSsp.length > 0 }
        );
        const capped = Math.min(requestedPayable, entitlement.remainingDays);
        sspDaysPaid = capped;
        const cumulativeAfter = cumulativePrior + capped;
        sspLimitReached = cumulativeAfter >= entitlement.maxDays;
        notifyCapReached =
          sspLimitReached && cumulativePrior < entitlement.maxDays;
        sspInfo = {
          eligible: true,
          payableDays: capped,
          sspDaysPaidThisRequest: capped,
          cumulativeSspDaysPaid: cumulativeAfter,
          dailyRate: entitlement.dailyRate,
          estimatedCost: Number((entitlement.dailyRate * capped).toFixed(2)),
          remainingDaysAfter: Math.max(0, entitlement.maxDays - cumulativeAfter),
          limitReached: sspLimitReached,
        };
      }
    }
  }

  // When the requester is the sole approver (no other admin/manager exists),
  // there's no one else to review their request — auto-approve it rather than
  // parking it in PENDING with nobody able to action it.
  const otherApprovers = await prisma.user.count({
    where: {
      organizationId: orgId,
      id: { not: userId },
      role: { in: ["ADMIN", "MANAGER"] },
    },
  });
  const autoApprove = otherApprovers === 0;

  const leaveRequest = await createRequestRow({
    startDate,
    endDate,
    leaveTypeId,
    note,
    sicknessNote: sicknessNote ?? undefined,
    userId,
    evidenceProvided: leaveTypeConfig.requiresEvidence
      ? evidenceConfirmed
      : evidenceProvided ?? false,
    kitDaysUsed: kitDaysUsed ?? 0,
    splitDaysUsed: splitDaysUsed ?? 0,
    hoursBooked: resolvedHoursBooked ?? undefined,
    childBirthDate: childBirthDate ?? undefined,
    splCurtailmentConfirmed: splCurtailmentConfirmed ?? false,
    dailyHolidayPayRate: dailyHolidayPayRate ?? undefined,
    sspDaysPaid,
    sspLimitReached,
    smpAverageWeeklyEarnings: smpAverageWeeklyEarnings ?? undefined,
    smpPhase1EndDate: smpPhase1EndDate ?? undefined,
    smpPhase2EndDate: smpPhase2EndDate ?? undefined,
    smpPhase1WeeklyRate: smpPhase1WeeklyRate ?? undefined,
    smpPhase2WeeklyRate: smpPhase2WeeklyRate ?? undefined,
    ...(autoApprove
      ? {
          status: "APPROVED" as const,
          reviewedById: userId,
          reviewedAt: new Date(),
        }
      : {}),
  });

  // ── Bradford Factor recalculation ─────────────────────────────────
  if (isSicknessLeave) {
    prisma.leaveRequest
      .findMany({
        where: {
          userId,
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
          where: { id: userId },
          data: { bradfordScore: score },
        });
      })
      .catch((err) => console.error("Bradford Factor update error:", err));
  }

  const daysRequested = countWeekdays(startDate, endDate);

  // Notify approvers of the new request (fire and forget). Skipped when
  // auto-approved — there's no one else to review it and it's already done.
  if (!autoApprove) {
    notifyNewRequest({
      organizationId: orgId,
      requestId: leaveRequest.id,
      userName: leaveRequest.user.name,
      leaveTypeName: leaveRequest.leaveType.name,
      startDate,
      endDate,
      note: note ?? null,
      daysRequested,
    }).catch((err) => console.error("Slack notification error:", err));

    emailNewRequest({
      requesterName: leaveRequest.user.name,
      leaveTypeName: leaveRequest.leaveType.name,
      startDate,
      endDate,
      note: note ?? null,
      organizationId: orgId,
    }).catch((err) => console.error("Email notification error:", err));
  }

  const actorMeta = {
    id: userId,
    email: leaveRequest.user.email,
    role: actor.role,
  };

  recordAudit({
    organizationId: orgId,
    action: "leave_request.created",
    resource: "leave_request",
    resourceId: leaveRequest.id,
    actor: actorMeta,
    metadata: {
      leaveType: leaveRequest.leaveType.name,
      startDate,
      endDate,
      daysRequested,
    },
    context,
  });

  // Keep the audit trail accurate when the request was auto-approved.
  if (autoApprove) {
    recordAudit({
      organizationId: orgId,
      action: "leave_request.approved",
      resource: "leave_request",
      resourceId: leaveRequest.id,
      actor: actorMeta,
      metadata: {
        leaveType: leaveRequest.leaveType.name,
        startDate,
        endDate,
        autoApproved: true,
      },
      context,
    });
  }

  trackServer(
    AnalyticsEvents.LEAVE_REQUEST_CREATED,
    {
      days_requested: daysRequested,
      is_statutory: /SSP|Statutory/i.test(leaveRequest.leaveType.name),
      leave_category: leaveTypeConfig.category,
      is_paid: leaveTypeConfig.isPaid,
    },
    {
      userId,
      organizationId: orgId,
      role: actor.role,
      plan: actor.plan,
    }
  );

  if (notifyCapReached && sspEmployeeSnapshot) {
    const sspEndDate = new Date(endDate);
    emailSspCapReached({
      employeeName: sspEmployeeSnapshot.name,
      sspEndDate,
      organizationId: sspEmployeeSnapshot.organizationId,
    }).catch((err) => console.error("SSP cap reached email error:", err));
    recordAudit({
      organizationId: sspEmployeeSnapshot.organizationId,
      action: "leave_request.ssp_cap_reached",
      resource: "leave_request",
      resourceId: leaveRequest.id,
      actor: actorMeta,
      metadata: {
        employee: sspEmployeeSnapshot.name,
        sspEndDate,
        weeklyRate: UK_SSP_WEEKLY_RATE,
        cumulativeDays: sspInfo?.cumulativeSspDaysPaid ?? null,
      },
      context,
    });
  }

  // Flag the very first request so the UI can acknowledge the milestone.
  const userRequestCount = await prisma.leaveRequest.count({ where: { userId } });
  const firstRequest = userRequestCount === 1;

  return {
    ok: true,
    request: leaveRequest,
    balanceWarning,
    sspInfo,
    firstRequest,
    autoApproved: autoApprove,
    daysRequested,
  };
}

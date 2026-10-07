import { prisma } from "@/lib/prisma";
import { getWorkingWeek } from "@/lib/working-week-server";
import { recomputeBradfordScore } from "./bradford";
import { getUserLeaveBalance } from "@/lib/leave-balances";
import { countWeekdays } from "@/lib/utils";
import { notifyNewRequest } from "@/lib/slack-notifications";
import { emailNewRequest, emailRequestStatusChange, emailSspCapReached } from "@/lib/email-notifications";
import { UK_SSP_WEEKLY_RATE } from "@/lib/uk-compliance";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { getDailyHolidayPayRateForUser } from "@/lib/holidayPay";
import { birthPayKind, shppClaimError, type BirthPayKind } from "@/lib/smp-dates";
import { checkOnBehalf, isSicknessLeaveTypeName, noticeError } from "./rules";
import { keepingInTouchError } from "@/lib/keeping-in-touch";
import { uplError } from "@/lib/unpaid-parental";
import { leaveYearForOrg } from "@/lib/leave-year-server";
import { computeShpp, computeSmpFields, computeSpp, isSharedParentalLeaveType } from "@/lib/smp-request";
import { sicknessOverlapError } from "./sickness-overlap";
import { computeSspForSpell, type SspInfo } from "./ssp-spell";

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
  /** Shown to the employee when a manager records leave for them. */
  name?: string | null;
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
  /** Expected week of childbirth (due date) — maternity, for the SMP service test. */
  expectedDueDate?: Date;
  /** Adoption (or SPL for an adoption): when they were told of the match, for the matching week. */
  matchedDate?: Date;
  /** Shared parental leave: their notice claims ShPP for these weeks. */
  shppClaimed?: boolean;
  splCurtailmentConfirmed?: boolean;
  /**
   * An admin/manager recording sickness for a team member (e.g. a phone call
   * before a shift). Recorded as approved straight away; evidence can follow.
   */
  onBehalfOfUserId?: string;
  /** Unpaid parental leave: which child it's for. */
  childId?: string;
  context?: AuditContext;
};


export type CreateLeaveResult =
  | {
      ok: true;
      request: Awaited<ReturnType<typeof createRequestRow>>;
      balanceWarning: string | null;
      sspInfo: SspInfo | null;
      /** Maternity or adoption: SMP or SAP weekly rates, or why not eligible. */
      smpInfo:
        | { kind: BirthPayKind; eligible: true; phase1Weekly: number; phase2Weekly: number }
        | { kind: BirthPayKind; eligible: false; reason: string }
        | null;
      /** Shared parental leave claiming ShPP: the weekly rate, or why not. */
      shppInfo: { eligible: boolean; weeklyRate: number | null; basis: string } | null;
      /** Paternity leave: the SPP weekly rate, or why not. */
      sppInfo: { eligible: boolean; weeklyRate: number | null; basis: string } | null;
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
    expectedDueDate,
    matchedDate,
    shppClaimed,
    splCurtailmentConfirmed,
    onBehalfOfUserId,
    childId,
    context,
  } = input;
  const onBehalf = !!onBehalfOfUserId && onBehalfOfUserId !== actor.id;
  const userId = onBehalf ? onBehalfOfUserId : actor.id;

  const leaveTypeConfig = await prisma.leaveType.findUnique({
    where: { id: leaveTypeId },
    select: {
      organizationId: true,
      name: true,
      minNoticeDays: true,
      requiresEvidence: true,
      applyProRata: true,
      category: true,
      isPaid: true,
    },
  });
  if (!leaveTypeConfig || leaveTypeConfig.organizationId !== orgId) {
    return { ok: false, status: 404, error: "Leave type not found" };
  }

  let subjectName: string | null = null;
  if (onBehalf) {
    const subject = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId, isActive: true },
      select: { name: true },
    });
    const check = checkOnBehalf({
      actorRole: actor.role,
      subjectFound: !!subject,
    });
    if (!check.ok) return check;
    subjectName = subject!.name;
  }

  const kitProblem = keepingInTouchError(leaveTypeConfig.name, { kitDaysUsed, splitDaysUsed });
  if (kitProblem) return { ok: false, status: 400, error: kitProblem };

  // Notice is between the employee and their manager. Leave a manager records
  // for someone was arranged with them already (often from earlier notice),
  // so it isn't held to the notice period at the time it's entered.
  const noticeProblem = onBehalf ? null : noticeError(leaveTypeConfig, startDate, new Date());
  if (noticeProblem) {
    return { ok: false, status: 400, error: noticeProblem };
  }
  // Sickness is self-certified for the first 7 days, so booking it never
  // needs evidence — a fit note is recorded later (FitNote), which is what
  // sets evidenceProvided. A typed note is not a fit note: counting it as one
  // hid absences from the overdue fit-note list.
  const isSicknessType = isSicknessLeaveTypeName(leaveTypeConfig.name);
  const evidenceConfirmed = !isSicknessType && evidenceProvided === true;

  if (leaveTypeConfig.requiresEvidence && !evidenceConfirmed && !isSicknessType) {
    return {
      ok: false,
      status: 400,
      error: "Evidence is required for this leave type",
    };
  }

  if (endDate < startDate) {
    return { ok: false, status: 400, error: "End date must be after start date" };
  }

  if (isSicknessType) {
    const overlap = await sicknessOverlapError({ userId, startDate, endDate });
    if (overlap) return { ok: false, status: 409, error: overlap };
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
    // The balance for the leave year the booking starts in.
    const balance = await getUserLeaveBalance(
      userId,
      leaveTypeId,
      await leaveYearForOrg(orgId, startDate)
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

  // ── Unpaid Parental Leave: per child ────────────────────────────────
  // Up to 18 weeks for each child before their 18th birthday, at most 4 weeks
  // for each child a year (rules and wording in src/lib/unpaid-parental.ts).
  const isUpl = /unpaid parental/i.test(leaveTypeConfig.name);
  if (isUpl) {
    if (!childId) {
      return {
        ok: false,
        status: 400,
        error: "Choose which child this unpaid parental leave is for.",
      };
    }
    const child = await prisma.child.findFirst({
      where: { id: childId, userId },
      select: { label: true, dateOfBirth: true, weeksTakenElsewhere: true },
    });
    if (!child) {
      return { ok: false, status: 404, error: "Child not found" };
    }
    const workingWeek = await getWorkingWeek(userId, startDate);
    const bookings = await prisma.leaveRequest.findMany({
      where: { childId, status: { in: ["APPROVED", "PENDING"] } },
      select: { startDate: true, endDate: true },
    });
    const parent = await prisma.user.findUnique({ where: { id: userId }, select: { serviceStartDate: true } });
    const uplProblem = uplError({
      childName: child.label?.trim() || "this child",
      dateOfBirth: child.dateOfBirth,
      serviceStartDate: parent?.serviceStartDate ?? null,
      request: { startDate, endDate },
      bookings,
      weeksTakenElsewhere: child.weeksTakenElsewhere,
      daysPerWeek: workingWeek.daysPerWeek,
      weekdays: workingWeek.weekdays,
    });
    if (uplProblem) return { ok: false, status: 400, error: uplProblem };
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
  let smpInfo: Extract<CreateLeaveResult, { ok: true }>["smpInfo"] = null;
  const payKind = birthPayKind(leaveTypeConfig.name);
  const isSpl = isSharedParentalLeaveType(leaveTypeConfig.name);
  const isPaternity = /paternity/i.test(leaveTypeConfig.name);

  // Paternity pay from the qualifying (or matching) week; shown on booking.
  let sppInfo: Extract<CreateLeaveResult, { ok: true }>["sppInfo"] = null;
  if (isPaternity) {
    try {
      const pay = await computeSpp({
        userId,
        startDate,
        expectedDueDate: expectedDueDate ?? null,
        matchedDate: matchedDate ?? null,
        childBirthDate: childBirthDate ?? null,
      });
      sppInfo = { eligible: pay.eligible, weeklyRate: pay.weeklyRate, basis: pay.basis };
    } catch (err) {
      console.error("SPP calculation failed:", err);
    }
  }
  const splClaimsPay = isSpl && !!shppClaimed;

  // ShPP: at most 37 weeks of pay for a child across this person's bookings
  // (the child is identified by the due or matching date).
  let shppInfo: Extract<CreateLeaveResult, { ok: true }>["shppInfo"] = null;
  if (splClaimsPay) {
    if (!expectedDueDate && !matchedDate) {
      return {
        ok: false,
        status: 400,
        error: "Add the baby's due date (birth) or the matching date (adoption) to claim Shared Parental Pay.",
      };
    }
    const otherClaims = await prisma.leaveRequest.findMany({
      where: {
        userId,
        shppClaimed: true,
        status: { in: ["PENDING", "APPROVED"] },
        ...(matchedDate ? { matchedDate } : { expectedDueDate }),
      },
      select: { startDate: true, endDate: true },
    });
    const capError = shppClaimError({ request: { startDate, endDate }, otherClaims });
    if (capError) return { ok: false, status: 400, error: capError };
    try {
      const pay = await computeShpp({
        userId,
        startDate,
        expectedDueDate: matchedDate ? null : (expectedDueDate ?? null),
        matchedDate: matchedDate ?? null,
      });
      shppInfo = { eligible: pay.eligible, weeklyRate: pay.weeklyRate, basis: pay.basis };
    } catch (err) {
      console.error("ShPP calculation failed:", err);
    }
  }
  if (payKind) {
    try {
      // Earnings from the 8 weeks up to the qualifying week (15 weeks before
      // the due week) or, for adoption, the matching week; not before the
      // leave starts. The LEAVE is a day-one right, so the dates are recorded
      // whatever the pay outcome; rates stay null when not eligible.
      const smp = await computeSmpFields({
        userId,
        startDate,
        expectedDueDate: payKind === "SMP" ? (expectedDueDate ?? null) : null,
        matchedDate: payKind === "SAP" ? (matchedDate ?? null) : null,
        kind: payKind,
      });
      smpAverageWeeklyEarnings = smp.fields.smpAverageWeeklyEarnings;
      smpPhase1WeeklyRate = smp.fields.smpPhase1WeeklyRate;
      smpPhase2WeeklyRate = smp.fields.smpPhase2WeeklyRate;
      smpPhase1EndDate = smp.fields.smpPhase1EndDate;
      smpPhase2EndDate = smp.fields.smpPhase2EndDate;
      smpInfo = smp.entitlement.eligible
        ? {
            kind: payKind,
            eligible: true,
            phase1Weekly: smp.entitlement.phase1Weekly,
            phase2Weekly: smp.entitlement.phase2Weekly,
          }
        : { kind: payKind, eligible: false, reason: smp.entitlement.reason };
    } catch (err) {
      console.error("SMP phase calculation failed:", err);
    }
  }

  // ── SSP eligibility & 28-week cap ──────────────────────────────────
  // Any sickness absence of a UK worker, whatever the leave type is called
  // (computeSspForSpell returns null for people who don't work in the UK).
  const isSicknessLeave = isSicknessType;
  const ssp = isSicknessLeave
    ? await computeSspForSpell({ userId, startDate, endDate })
    : null;
  const sspInfo: SspInfo | null = ssp?.info ?? null;
  const sspDaysPaid = ssp?.sspDaysPaid ?? 0;
  const sspDailyRate = ssp ? ssp.info.dailyRate : null;
  const sspAverageWeeklyEarnings = ssp ? ssp.info.averageWeeklyEarnings : null;
  const sspLimitReached = ssp?.sspLimitReached ?? false;
  const notifyCapReached = ssp?.capReachedNow ?? false;
  const sspEmployeeSnapshot = ssp?.employee ?? null;

  // When the requester is the sole approver (no other admin/manager exists),
  // there's no one else to review their request — auto-approve it rather than
  // parking it in PENDING with nobody able to action it.
  const otherApprovers = await prisma.user.count({
    where: {
      organizationId: orgId,
      id: { not: userId },
      role: { in: ["ADMIN", "MANAGER"] },
      // People who've left don't approve or get alerts.
      isActive: true,
    },
  });
  // Sickness logged by a manager is a record of fact, not a request to review.
  const autoApprove = onBehalf || otherApprovers === 0;

  const leaveRequest = await createRequestRow({
    startDate,
    endDate,
    leaveTypeId,
    note,
    sicknessNote: sicknessNote ?? undefined,
    userId,
    // Sickness evidence comes only from recorded fit notes (see fit-notes.ts).
    evidenceProvided: isSicknessType
      ? false
      : leaveTypeConfig.requiresEvidence
        ? evidenceConfirmed
        : evidenceProvided ?? false,
    kitDaysUsed: kitDaysUsed ?? 0,
    splitDaysUsed: splitDaysUsed ?? 0,
    hoursBooked: resolvedHoursBooked ?? undefined,
    childBirthDate: childBirthDate ?? undefined,
    childId: isUpl ? childId : undefined,
    expectedDueDate: expectedDueDate ?? undefined,
    matchedDate: payKind === "SAP" || isSpl || isPaternity ? (matchedDate ?? undefined) : undefined,
    shppClaimed: splClaimsPay,
    splCurtailmentConfirmed: splCurtailmentConfirmed ?? false,
    dailyHolidayPayRate: dailyHolidayPayRate ?? undefined,
    sspDaysPaid,
    sspLimitReached,
    sspDailyRate,
    sspAverageWeeklyEarnings,
    smpAverageWeeklyEarnings: smpAverageWeeklyEarnings ?? undefined,
    smpPhase1EndDate: smpPhase1EndDate ?? undefined,
    smpPhase2EndDate: smpPhase2EndDate ?? undefined,
    smpPhase1WeeklyRate: smpPhase1WeeklyRate ?? undefined,
    smpPhase2WeeklyRate: smpPhase2WeeklyRate ?? undefined,
    ...(autoApprove
      ? {
          status: "APPROVED" as const,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        }
      : {}),
  });

  // ── Bradford Factor recalculation ─────────────────────────────────
  if (isSicknessLeave) {
    recomputeBradfordScore(userId);
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

  // Planned leave a manager records for someone is news to them in the app:
  // tell them it's on the system. (Logged sickness isn't — they rang in.)
  if (onBehalf && !isSicknessType) {
    emailRequestStatusChange({
      requesterEmail: leaveRequest.user.email,
      requesterName: leaveRequest.user.name,
      status: "APPROVED",
      leaveTypeName: leaveRequest.leaveType.name,
      startDate,
      endDate,
      reviewerName: actor.name ?? actor.email ?? "Your manager",
      recorded: true,
    }).catch((err) => console.error("Recorded leave email error:", err));
  }

  const actorMeta = {
    id: actor.id,
    email: onBehalf ? actor.email : leaveRequest.user.email,
    role: actor.role,
  };
  const onBehalfMeta = onBehalf
    ? { loggedOnBehalfOf: { id: userId, name: subjectName } }
    : {};

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
      ...onBehalfMeta,
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
        ...onBehalfMeta,
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
      logged_on_behalf: onBehalf,
    },
    {
      userId: actor.id,
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
    smpInfo,
    shppInfo,
    sppInfo,
    firstRequest,
    autoApproved: autoApprove,
    daysRequested,
  };
}

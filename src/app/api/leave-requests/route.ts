import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserLeaveBalance } from "@/lib/leave-balances";
import { countWeekdays } from "@/lib/utils";
import { notifyNewRequest } from "@/lib/slack-notifications";
import { emailNewRequest, emailSspCapReached } from "@/lib/email-notifications";
import {
  SSP_MAX_WEEKS,
  calculateSspPayableDays,
  calculateSspEntitlement,
  UK_SSP_WEEKLY_RATE,
} from "@/lib/uk-compliance";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import {
  getDailyHolidayPayRateForUser,
} from "@/lib/holidayPay";
import {
  calculateSMPPhaseDates,
  calculateSMPPhaseRates,
  getAweForUser,
  isMaternityLeaveType,
} from "@/lib/smpCalculator";
import { calculateBradfordFactor } from "@/lib/uk-compliance";
import { z } from "zod";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const userId = searchParams.get("userId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const currentUserId = sessionUser.id as string;
  const userRole = sessionUser.role as string;

  const where: Record<string, unknown> = {
    user: { organizationId: orgId },
  };

  if (userRole === "MEMBER") {
    where.userId = currentUserId;
  } else if (userId) {
    where.userId = userId;
  }

  if (status) {
    where.status = status;
  }
  if (from || to) {
    where.endDate = from ? { gte: new Date(from) } : undefined;
    where.startDate = to ? { lte: new Date(to) } : undefined;
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          countryCode: true,
          memberType: true,
          regionId: true,
        },
      },
      leaveType: {
        select: { id: true, name: true, color: true },
      },
      reviewedBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json(requests);
}

const createSchema = z.object({
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  leaveTypeId: z.string(),
  note: z.string().optional(),
  sicknessNote: z.string().optional(),
  evidenceProvided: z.boolean().optional(),
  kitDaysUsed: z.number().int().min(0).optional(),
  splitDaysUsed: z.number().int().min(0).optional(),
  childBirthDate: z.string().transform((s) => new Date(s)).optional(),
  splCurtailmentConfirmed: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { startDate, endDate, leaveTypeId, note, sicknessNote, evidenceProvided, kitDaysUsed, splitDaysUsed, childBirthDate, splCurtailmentConfirmed } = parsed.data;
    const userId = (session.user as Record<string, unknown>).id as string;
    const leaveTypeConfig = await prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { name: true, minNoticeDays: true, requiresEvidence: true, applyProRata: true },
    });
    if (!leaveTypeConfig) {
      return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
    }
    const now = new Date();
    const noticeDays = Math.floor((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (noticeDays < leaveTypeConfig.minNoticeDays) {
      return NextResponse.json(
        { error: `This leave type requires at least ${leaveTypeConfig.minNoticeDays} days notice` },
        { status: 400 }
      );
    }
    if (leaveTypeConfig.requiresEvidence && !evidenceProvided) {
      return NextResponse.json(
        { error: "Evidence is required for this leave type" },
        { status: 400 }
      );
    }


    if (endDate < startDate) {
      return NextResponse.json(
        { error: "End date must be after start date" },
        { status: 400 }
      );
    }

    // Check leave balance (warn but don't block)
    let balanceWarning: string | null = null;
    try {
      const requestedDays = countWeekdays(startDate, endDate);
      const balance = await getUserLeaveBalance(
        userId,
        leaveTypeId,
        startDate.getFullYear()
      );
      if (balance && requestedDays > balance.remaining) {
        balanceWarning = `This request (${requestedDays} days) exceeds your remaining balance of ${balance.remaining} days for ${balance.leaveTypeName}.`;
      }
    } catch {
      // Don't block request creation if balance check fails
    }

    // ── Paternity leave: 56-day birth window ──────────────────────────
    const isPaternityLeave = /paternity/i.test(leaveTypeConfig.name);
    if (isPaternityLeave && childBirthDate) {
      const windowEnd = new Date(childBirthDate);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 56);
      if (startDate > windowEnd) {
        return NextResponse.json(
          { error: "Paternity leave must start within 56 days of the child's birth or placement date" },
          { status: 400 }
        );
      }
    }

    // ── Unpaid Parental Leave: 4 weeks/year cap ────────────────────────
    const isUpl = /unpaid parental/i.test(leaveTypeConfig.name);
    if (isUpl) {
      const yearStart = new Date(Date.UTC(startDate.getUTCFullYear(), 0, 1));
      const yearEnd = new Date(Date.UTC(startDate.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
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
        return NextResponse.json(
          { error: `Unpaid Parental Leave is capped at 4 weeks (20 working days) per year. You have ${20 - usedUplDays} days remaining.` },
          { status: 400 }
        );
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
    // For maternity leave, compute Average Weekly Earnings from the last
    // 8 paid weeks and derive the two phase rates:
    //   • Phase 1 (weeks 1–6):  90% AWE
    //   • Phase 2 (weeks 7–39): min(flat SMP rate, 90% AWE)
    // Failure is non-blocking — the leave request still gets created so
    // HR can record the absence, and payroll is flagged via null rates.
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
    // Checked up-front so that (a) `sspDaysPaid` / `sspLimitReached` are
    // persisted on the record and (b) the API response surfaces the
    // reason when SSP is not payable. We never block the underlying
    // leave request — the absence is still a fact — but the monetary
    // side is gated on statutory eligibility.
    const isSspLeave = leaveTypeConfig.name.includes("SSP");
    let sspInfo:
      | {
          eligible: boolean;
          reason?: string;
          payableDays: number;
          sspDaysPaidThisRequest: number;
          cumulativeSspDaysPaid: number;
          dailyRate: number;
          estimatedCost: number;
          remainingDaysAfter: number;
          limitReached: boolean;
        }
      | null = null;
    let sspDaysPaid = 0;
    let sspLimitReached = false;
    let notifyCapReached = false;
    let sspEmployeeSnapshot:
      | { name: string; organizationId: string }
      | null = null;

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
        // Linked PIW: any SSP leave within the last 56 calendar days
        // counts as the same period of incapacity for work.
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

        const entitlement = calculateSspEntitlement({
          averageWeeklyEarnings:
            employee.averageWeeklyEarnings === null
              ? null
              : Number(employee.averageWeeklyEarnings),
          sspDaysPaidInPeriod: cumulativePrior,
          qualifyingDaysPerWeek: employee.qualifyingDaysPerWeek,
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
              SSP_MAX_WEEKS *
                Number(employee.qualifyingDaysPerWeek ?? 5) -
                cumulativePrior
            ),
            limitReached: entitlement.reason === "SSP 28-week limit reached",
          };
        } else {
          const requestedPayable = calculateSspPayableDays(startDate, endDate);
          const capped = Math.min(requestedPayable, entitlement.remainingDays);
          sspDaysPaid = capped;
          const cumulativeAfter = cumulativePrior + capped;
          sspLimitReached = cumulativeAfter >= entitlement.maxDays;
          notifyCapReached = sspLimitReached && cumulativePrior < entitlement.maxDays;
          sspInfo = {
            eligible: true,
            payableDays: capped,
            sspDaysPaidThisRequest: capped,
            cumulativeSspDaysPaid: cumulativeAfter,
            dailyRate: entitlement.dailyRate,
            estimatedCost: Number(
              (entitlement.dailyRate * capped).toFixed(2)
            ),
            remainingDaysAfter: Math.max(
              0,
              entitlement.maxDays - cumulativeAfter
            ),
            limitReached: sspLimitReached,
          };
        }
      }
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        startDate,
        endDate,
        leaveTypeId,
        note,
        sicknessNote: sicknessNote ?? undefined,
        userId,
        evidenceProvided: evidenceProvided ?? false,
        kitDaysUsed: kitDaysUsed ?? 0,
        splitDaysUsed: splitDaysUsed ?? 0,
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
      },
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

    // ── Bradford Factor recalculation ─────────────────────────────────
    // Recompute on every SSP/sickness event so reports always reflect live data.
    if (isSspLeave) {
      prisma.leaveRequest
        .findMany({
          where: {
            userId,
            leaveType: { name: { contains: "SSP" } },
            status: { in: ["APPROVED", "PENDING"] },
          },
          select: { startDate: true, endDate: true },
        })
        .then((sspRequests) => {
          const spells = sspRequests.length;
          const days = sspRequests.reduce(
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

    // Send notifications (fire and forget)
    const daysRequested = countWeekdays(startDate, endDate);
    const orgId = (session.user as Record<string, unknown>).organizationId as string;

    notifyNewRequest({
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

    recordAudit({
      organizationId: orgId,
      action: "leave_request.created",
      resource: "leave_request",
      resourceId: leaveRequest.id,
      actor: {
        id: userId,
        email: leaveRequest.user.email,
        role: (session.user as Record<string, unknown>).role as string,
      },
      metadata: {
        leaveType: leaveRequest.leaveType.name,
        startDate,
        endDate,
        daysRequested,
      },
      context: requestAuditContext(request),
    });

    if (notifyCapReached && sspEmployeeSnapshot) {
      const sspEndDate = new Date(endDate);
      emailSspCapReached({
        employeeName: sspEmployeeSnapshot.name,
        sspEndDate,
        organizationId: sspEmployeeSnapshot.organizationId,
      }).catch((err) =>
        console.error("SSP cap reached email error:", err)
      );
      recordAudit({
        organizationId: sspEmployeeSnapshot.organizationId,
        action: "leave_request.ssp_cap_reached",
        resource: "leave_request",
        resourceId: leaveRequest.id,
        actor: {
          id: userId,
          email: leaveRequest.user.email,
          role: (session.user as Record<string, unknown>).role as string,
        },
        metadata: {
          employee: sspEmployeeSnapshot.name,
          sspEndDate,
          weeklyRate: UK_SSP_WEEKLY_RATE,
          cumulativeDays: sspInfo?.cumulativeSspDaysPaid ?? null,
        },
        context: requestAuditContext(request),
      });
    }

    return NextResponse.json({ ...leaveRequest, balanceWarning, sspInfo }, { status: 201 });
  } catch (error) {
    console.error("Create leave request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { prisma } from "@/lib/prisma";
import {
  SSP_MAX_WEEKS,
  calculateSspPayableDaysForSpell,
  calculateSspEntitlement,
} from "@/lib/uk-compliance";
import { resolveAverageWeeklyEarnings } from "@/lib/smpCalculator";

export type SspInfo = {
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

export type SspSpellResult = {
  info: SspInfo;
  sspDaysPaid: number;
  sspLimitReached: boolean;
  /** True when this spell is the one that takes the employee to the cap. */
  capReachedNow: boolean;
  employee: { name: string; organizationId: string };
};

/**
 * SSP for one sickness spell [startDate, endDate]: eligibility, payable days
 * (waiting days unless linked to a prior spell), and the 28-week cap. Shared
 * by creating a sickness request and changing its end date.
 *
 * Prior spells are those ending in the 56 days before this one starts.
 * Rejected and cancelled requests never happened, so they don't count towards
 * linking or the cap.
 */
export async function computeSspForSpell(input: {
  userId: string;
  startDate: Date;
  endDate: Date;
}): Promise<SspSpellResult | null> {
  const { userId, startDate, endDate } = input;
  const employee = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      organizationId: true,
      qualifyingDaysPerWeek: true,
      averageWeeklyEarnings: true,
    },
  });
  if (!employee) return null;

  const piwFloor = new Date(startDate);
  piwFloor.setDate(piwFloor.getDate() - 56);
  const priorSsp = await prisma.leaveRequest.findMany({
    where: {
      userId,
      leaveType: { name: { contains: "SSP" } },
      status: { notIn: ["REJECTED", "CANCELLED"] },
      endDate: { gte: piwFloor, lt: startDate },
    },
    select: { sspDaysPaid: true },
  });
  const cumulativePrior = priorSsp.reduce((sum, r) => sum + (r.sspDaysPaid ?? 0), 0);

  const averageWeeklyEarnings = await resolveAverageWeeklyEarnings(
    userId,
    startDate,
    employee.averageWeeklyEarnings === null ? null : Number(employee.averageWeeklyEarnings)
  );

  const entitlement = calculateSspEntitlement({
    averageWeeklyEarnings,
    sspDaysPaidInPeriod: cumulativePrior,
    qualifyingDaysPerWeek: employee.qualifyingDaysPerWeek,
    // Pick pre- vs post-6-April-2026 SSP rules by the spell's start date.
    onDate: startDate,
  });
  const employeeRef = { name: employee.name, organizationId: employee.organizationId };

  if (!entitlement.eligible) {
    return {
      info: {
        eligible: false,
        reason: entitlement.reason,
        payableDays: 0,
        sspDaysPaidThisRequest: 0,
        cumulativeSspDaysPaid: cumulativePrior,
        dailyRate: 0,
        estimatedCost: 0,
        remainingDaysAfter: Math.max(
          0,
          SSP_MAX_WEEKS * Number(employee.qualifyingDaysPerWeek ?? 5) - cumulativePrior
        ),
        limitReached: entitlement.reason === "SSP 28-week limit reached",
      },
      sspDaysPaid: 0,
      sspLimitReached: false,
      capReachedNow: false,
      employee: employeeRef,
    };
  }

  // Waiting days are served once per PIW. A spell linked to a prior SSP spell
  // (one ending within the 56-day window above) has already served them, so
  // it pays every weekday with no 3-day deduction; re-deducting would underpay.
  const requestedPayable = calculateSspPayableDaysForSpell(startDate, endDate, {
    linkedToPriorPiw: priorSsp.length > 0,
  });
  const capped = Math.min(requestedPayable, entitlement.remainingDays);
  const cumulativeAfter = cumulativePrior + capped;
  const sspLimitReached = cumulativeAfter >= entitlement.maxDays;
  return {
    info: {
      eligible: true,
      payableDays: capped,
      sspDaysPaidThisRequest: capped,
      cumulativeSspDaysPaid: cumulativeAfter,
      dailyRate: entitlement.dailyRate,
      estimatedCost: Number((entitlement.dailyRate * capped).toFixed(2)),
      remainingDaysAfter: Math.max(0, entitlement.maxDays - cumulativeAfter),
      limitReached: sspLimitReached,
    },
    sspDaysPaid: capped,
    sspLimitReached,
    capReachedNow: sspLimitReached && cumulativePrior < entitlement.maxDays,
    employee: employeeRef,
  };
}

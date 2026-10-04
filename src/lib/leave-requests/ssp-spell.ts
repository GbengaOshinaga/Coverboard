import { prisma } from "@/lib/prisma";
import { getWorkingWeek } from "@/lib/working-week-server";
import {
  SSP_MAX_WEEKS,
  calculateSspPayableDaysForSpell,
  calculateSspEntitlement,
} from "@/lib/uk-compliance";
import { resolveAverageWeeklyEarnings } from "@/lib/smpCalculator";
import { linkedPriorChain } from "@/lib/sickness-spells";

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
 * Prior spells are the linked chain before this one: each within 56 days of
 * the next, however far back that goes (a linked period can last up to 3
 * years). Rejected and cancelled requests never happened, so they don't count
 * towards linking or the cap.
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

  const lookbackFloor = new Date(startDate);
  lookbackFloor.setUTCFullYear(lookbackFloor.getUTCFullYear() - 3);
  const priorSsp = await prisma.leaveRequest.findMany({
    where: {
      userId,
      leaveType: { name: { contains: "SSP" } },
      status: { notIn: ["REJECTED", "CANCELLED"] },
      endDate: { gte: lookbackFloor, lt: startDate },
    },
    select: { startDate: true, endDate: true, sspDaysPaid: true },
  });
  const chain = linkedPriorChain(priorSsp, startDate);
  const cumulativePrior = chain.daysPaid;

  const averageWeeklyEarnings = await resolveAverageWeeklyEarnings(
    userId,
    startDate,
    employee.averageWeeklyEarnings === null ? null : Number(employee.averageWeeklyEarnings)
  );

  // SSP is payable on qualifying days — the days they normally work. Their
  // working pattern says which; without one, the stored count (Mon–Fri days).
  const workingWeek = await getWorkingWeek(userId, startDate, "ssp");

  const entitlement = calculateSspEntitlement({
    averageWeeklyEarnings,
    sspDaysPaidInPeriod: cumulativePrior,
    qualifyingDaysPerWeek: workingWeek.daysPerWeek,
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
          SSP_MAX_WEEKS * workingWeek.daysPerWeek - cumulativePrior
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
  // has already served them, so it pays every weekday with no 3-day
  // deduction; re-deducting would underpay.
  const requestedPayable = calculateSspPayableDaysForSpell(startDate, endDate, {
    linkedToPriorPiw: chain.linked,
    qualifyingWeekdays: workingWeek.weekdays,
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

/**
 * After an SSP spell changes, later spells may link differently (or stop
 * linking), which changes their waiting days and their share of the 28-week
 * cap. Recomputes each later live SSP spell in date order, so every one sees
 * the corrected spells before it. Returns how many rows changed.
 *
 * Not transactional: each step reads the rows the previous step wrote. A
 * failure part-way leaves later spells as they were before, never worse.
 */
export async function recomputeLaterSspSpells(userId: string, after: Date): Promise<number> {
  const later = await prisma.leaveRequest.findMany({
    where: {
      userId,
      leaveType: { name: { contains: "SSP" } },
      status: { notIn: ["REJECTED", "CANCELLED"] },
      startDate: { gt: after },
    },
    orderBy: { startDate: "asc" },
    select: { id: true, startDate: true, endDate: true, sspDaysPaid: true, sspLimitReached: true },
  });
  let changed = 0;
  for (const spell of later) {
    const ssp = await computeSspForSpell({
      userId,
      startDate: spell.startDate,
      endDate: spell.endDate,
    });
    if (!ssp) continue;
    if (ssp.sspDaysPaid === spell.sspDaysPaid && ssp.sspLimitReached === spell.sspLimitReached) {
      continue;
    }
    await prisma.leaveRequest.update({
      where: { id: spell.id },
      data: { sspDaysPaid: ssp.sspDaysPaid, sspLimitReached: ssp.sspLimitReached },
    });
    changed += 1;
  }
  return changed;
}

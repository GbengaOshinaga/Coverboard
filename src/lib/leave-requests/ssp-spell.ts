import { prisma } from "@/lib/prisma";
import { SICKNESS_LEAVE_TYPE, sspAppliesTo } from "@/lib/ssp-scope";
import { getWorkingWeek } from "@/lib/working-week-server";
import {
  SSP_MAX_WEEKS,
  calculateSspPayableDaysForSpell,
  calculateSspEntitlement,
  sspPay,
  sspRateBasis,
} from "@/lib/uk-compliance";
import { getAweForUser } from "@/lib/smpCalculator";
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
  /** Average weekly earnings in the 8 weeks before; null = no pay recorded. */
  averageWeeklyEarnings: number | null;
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
/**
 * The earlier sickness absences linked to one starting on `startDate` (each within
 * 56 days of the next; a linked period can last up to 3 years) and the SSP
 * days already paid across them. Rejected and cancelled requests never
 * happened, so they don't count.
 */
export async function priorLinkedSsp(userId: string, startDate: Date) {
  const lookbackFloor = new Date(startDate);
  lookbackFloor.setUTCFullYear(lookbackFloor.getUTCFullYear() - 3);
  const priorSsp = await prisma.leaveRequest.findMany({
    where: {
      userId,
      leaveType: SICKNESS_LEAVE_TYPE,
      status: { notIn: ["REJECTED", "CANCELLED"] },
      endDate: { gte: lookbackFloor, lt: startDate },
    },
    select: { startDate: true, endDate: true, sspDaysPaid: true },
  });
  return linkedPriorChain(priorSsp, startDate);
}

/**
 * SSP days left in the 28-week limit after this absence. The limit covers the
 * whole linked period, so earlier linked absences count too: 84 days for a
 * 3-day worker, minus 6 on the first absence and 2 on a linked second = 76.
 */
export async function sspDaysRemainingAfter(input: {
  userId: string;
  startDate: Date;
  sspDaysPaid: number;
  daysPerWeek: number;
}): Promise<{ maxDays: number; remainingDays: number }> {
  const chain = await priorLinkedSsp(input.userId, input.startDate);
  const maxDays = SSP_MAX_WEEKS * input.daysPerWeek;
  return { maxDays, remainingDays: Math.max(0, maxDays - chain.daysPaid - input.sspDaysPaid) };
}

type Stored = { toString(): string } | number | null;

/**
 * The SSP daily rate for an absence and the earnings behind it: as stored
 * when it was booked, or — for absences booked before rates were stored —
 * worked out the same way now, so payroll is never left without one.
 */
export async function sspRateFor(absence: {
  userId: string;
  startDate: Date;
  endDate: Date;
  sspDailyRate: Stored;
  sspAverageWeeklyEarnings: Stored;
}): Promise<{ dailyRate: number; averageWeeklyEarnings: number | null; basis: string } | null> {
  let dailyRate: number;
  let averageWeeklyEarnings: number | null;
  if (absence.sspDailyRate !== null) {
    dailyRate = Number(absence.sspDailyRate);
    averageWeeklyEarnings =
      absence.sspAverageWeeklyEarnings === null ? null : Number(absence.sspAverageWeeklyEarnings);
  } else {
    const ssp = await computeSspForSpell(absence);
    if (!ssp) return null;
    dailyRate = ssp.info.dailyRate;
    averageWeeklyEarnings = ssp.info.averageWeeklyEarnings;
  }
  return {
    dailyRate,
    averageWeeklyEarnings,
    basis: sspRateBasis({ startDate: absence.startDate, averageWeeklyEarnings }),
  };
}

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
      workCountry: true,
    },
  });
  // SSP is a UK duty: no SSP for people who work elsewhere.
  if (!employee || !sspAppliesTo(employee.workCountry)) return null;

  const chain = await priorLinkedSsp(userId, startDate);
  const cumulativePrior = chain.daysPaid;

  // Earnings in the 8 weeks before this absence, read-only: reports call this
  // for absences booked before rates were stored, and a different date's
  // figure (or one cached on the person) would give the wrong rate. With no
  // earnings recorded, SSP is the flat rate (never under-paid).
  const averageWeeklyEarnings = await getAweForUser(userId, startDate);

  // SSP is payable on qualifying days — the days they normally work. Their
  // working pattern says which; without one, the stored count (Mon–Fri days).
  const workingWeek = await getWorkingWeek(userId, startDate);

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
        averageWeeklyEarnings,
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
      estimatedCost: sspPay(capped, entitlement.dailyRate, workingWeek.daysPerWeek),
      remainingDaysAfter: Math.max(0, entitlement.maxDays - cumulativeAfter),
      limitReached: sspLimitReached,
      averageWeeklyEarnings,
    },
    sspDaysPaid: capped,
    sspLimitReached,
    capReachedNow: sspLimitReached && cumulativePrior < entitlement.maxDays,
    employee: employeeRef,
  };
}

/** The SSP fields stored on a sickness absence. */
export function sspFields(ssp: SspSpellResult) {
  return {
    sspDaysPaid: ssp.sspDaysPaid,
    sspLimitReached: ssp.sspLimitReached,
    sspDailyRate: ssp.info.dailyRate,
    sspAverageWeeklyEarnings: ssp.info.averageWeeklyEarnings,
  };
}

/**
 * Recomputes the given live SSP spells in date order, so each sees the
 * corrected spells before it. Returns how many rows changed.
 *
 * Not transactional: each step reads the rows the previous step wrote. A
 * failure part-way leaves later spells as they were before, never worse.
 */
async function recomputeSspSpells(userId: string, where: object): Promise<number> {
  const spells = await prisma.leaveRequest.findMany({
    where: {
      userId,
      leaveType: SICKNESS_LEAVE_TYPE,
      status: { notIn: ["REJECTED", "CANCELLED"] },
      ...where,
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      sspDaysPaid: true,
      sspLimitReached: true,
      sspDailyRate: true,
      sspAverageWeeklyEarnings: true,
    },
  });
  let changed = 0;
  for (const spell of spells) {
    const ssp = await computeSspForSpell({ userId, startDate: spell.startDate, endDate: spell.endDate });
    if (!ssp) continue;
    const next = sspFields(ssp);
    if (
      next.sspDaysPaid === spell.sspDaysPaid &&
      next.sspLimitReached === spell.sspLimitReached &&
      spell.sspDailyRate !== null &&
      Number(spell.sspDailyRate) === next.sspDailyRate &&
      (spell.sspAverageWeeklyEarnings === null ? null : Number(spell.sspAverageWeeklyEarnings)) ===
        next.sspAverageWeeklyEarnings
    ) {
      continue;
    }
    await prisma.leaveRequest.update({ where: { id: spell.id }, data: next });
    changed += 1;
  }
  return changed;
}

/**
 * After an SSP spell changes, later spells may link differently (or stop
 * linking), which changes their waiting days and their share of the 28-week
 * cap.
 */
export function recomputeLaterSspSpells(userId: string, after: Date): Promise<number> {
  return recomputeSspSpells(userId, { startDate: { gt: after } });
}

/**
 * After someone's working pattern changes, SSP for absences still going on or
 * still to come is recalculated on their new working week. Past absences keep
 * the figures they were paid on.
 */
export function recomputeCurrentSspSpells(userId: string, today: Date = new Date()): Promise<number> {
  return recomputeSspSpells(userId, { endDate: { gte: today } });
}

/** All of a person's live SSP spells, oldest first (used by the backfill). */
export function recomputeAllSspSpells(userId: string): Promise<number> {
  return recomputeSspSpells(userId, {});
}

/**
 * Pay is often entered after someone goes off sick. SSP is worked out from
 * earnings in the 8 weeks before each absence, so when a week's earnings are
 * added, changed or removed, absences starting after that week are
 * recalculated (all of them, oldest first, because of the linked 28-week limit).
 */
export function recomputeSspAfterEarningsChange(userId: string, weekStartDate: Date): Promise<number> {
  return recomputeSspSpells(userId, { startDate: { gt: weekStartDate } });
}

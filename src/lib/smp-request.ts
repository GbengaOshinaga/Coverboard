import { prisma } from "@/lib/prisma";
import { calculateSMPPhaseDates, calculateSmpEntitlement, getAweDetailForUser } from "@/lib/smpCalculator";
import { smpEarningsCutoff } from "@/lib/smp-dates";

/**
 * SMP for a maternity request, from earnings in the 8 weeks up to the
 * qualifying week (src/lib/smp-dates.ts). Used at booking and again whenever
 * earnings change, because pay is often entered after leave is booked.
 */
export async function computeSmpFields(input: {
  userId: string;
  startDate: Date;
  expectedDueDate: Date | null;
}) {
  const [{ awe, weeksCounted }, employee] = await Promise.all([
    getAweDetailForUser(input.userId, smpEarningsCutoff(input)),
    prisma.user.findUnique({ where: { id: input.userId }, select: { serviceStartDate: true } }),
  ]);
  const entitlement = calculateSmpEntitlement(awe, {
    serviceStartDate: employee?.serviceStartDate ?? null,
    expectedDueDate: input.expectedDueDate,
  });
  const phases = calculateSMPPhaseDates(input.startDate);
  return {
    fields: {
      smpAverageWeeklyEarnings: awe,
      smpPhase1WeeklyRate: entitlement.eligible ? entitlement.phase1Weekly : null,
      smpPhase2WeeklyRate: entitlement.eligible ? entitlement.phase2Weekly : null,
      smpPhase1EndDate: phases.phase1EndDate,
      smpPhase2EndDate: phases.phase2EndDate,
    },
    entitlement,
    /** Weeks of the 8 with pay recorded (the average uses what's there). */
    weeksCounted,
  };
}

/**
 * Maternity requests as shown: SMP worked out now from current earnings and
 * saved if it changed, so a request booked before pay was entered (or before
 * a fix) never shows a stale "no SMP". Adds how many of the 8 weeks had pay.
 */
export async function withCurrentSmp<
  T extends {
    id: string;
    userId: string;
    status: string;
    startDate: Date;
    expectedDueDate: Date | null;
    smpAverageWeeklyEarnings: unknown;
    smpPhase1WeeklyRate: unknown;
    smpPhase2WeeklyRate: unknown;
    leaveType: { name: string };
  },
>(requests: T[]): Promise<Array<T & { smpEarningsWeeks?: number }>> {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return Promise.all(
    requests.map(async (r) => {
      if (!/maternity/i.test(r.leaveType.name) || r.status === "CANCELLED" || r.status === "REJECTED") return r;
      const smp = await computeSmpFields({ userId: r.userId, startDate: r.startDate, expectedDueDate: r.expectedDueDate });
      const changed =
        num(r.smpAverageWeeklyEarnings) !== smp.fields.smpAverageWeeklyEarnings ||
        num(r.smpPhase1WeeklyRate) !== smp.fields.smpPhase1WeeklyRate ||
        num(r.smpPhase2WeeklyRate) !== smp.fields.smpPhase2WeeklyRate;
      if (changed) await prisma.leaveRequest.update({ where: { id: r.id }, data: smp.fields });
      return { ...r, ...smp.fields, smpEarningsWeeks: smp.weeksCounted };
    })
  );
}

/** After earnings change: recalculate SMP on their live maternity requests. */
export async function recomputeSmpAfterEarningsChange(userId: string): Promise<number> {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: ["PENDING", "APPROVED"] },
      leaveType: { name: { contains: "maternity", mode: "insensitive" } },
    },
    select: { id: true, startDate: true, expectedDueDate: true },
  });
  for (const r of requests) {
    const { fields } = await computeSmpFields({ userId, startDate: r.startDate, expectedDueDate: r.expectedDueDate });
    await prisma.leaveRequest.update({ where: { id: r.id }, data: fields });
  }
  return requests.length;
}

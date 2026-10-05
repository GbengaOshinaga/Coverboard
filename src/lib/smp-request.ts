import { prisma } from "@/lib/prisma";
import { calculateSMPPhaseDates, calculateSmpEntitlement, getAweForUser } from "@/lib/smpCalculator";
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
  const [awe, employee] = await Promise.all([
    getAweForUser(input.userId, smpEarningsCutoff(input)),
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
  };
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

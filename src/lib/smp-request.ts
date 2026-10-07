import { prisma } from "@/lib/prisma";
import { calculateSMPPhaseDates, calculateSmpEntitlement, getAweDetailForUser } from "@/lib/smpCalculator";
import { birthPayKind, payTestWeek, smpEarningsCutoff, type BirthPayKind } from "@/lib/smp-dates";

/**
 * SMP for a maternity request, or SAP for an adoption one, from earnings in
 * the 8 weeks up to the qualifying or matching week (src/lib/smp-dates.ts).
 * Same rates and phases; stored in the smp* fields. Used at booking and again
 * whenever earnings change, because pay is often entered after leave is booked.
 */
export async function computeSmpFields(input: {
  userId: string;
  startDate: Date;
  expectedDueDate: Date | null;
  /** Adoption only. */
  matchedDate?: Date | null;
  kind?: BirthPayKind;
}) {
  const kind = input.kind ?? "SMP";
  const matchedDate = input.matchedDate ?? null;
  const [{ awe, weeksCounted }, employee] = await Promise.all([
    getAweDetailForUser(input.userId, smpEarningsCutoff({ ...input, kind, matchedDate })),
    prisma.user.findUnique({ where: { id: input.userId }, select: { serviceStartDate: true } }),
  ]);
  const entitlement = calculateSmpEntitlement(awe, {
    serviceStartDate: employee?.serviceStartDate ?? null,
    serviceTestWeek: payTestWeek({ kind, expectedDueDate: input.expectedDueDate, matchedDate }),
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
 * Maternity and adoption requests as shown: SMP or SAP worked out now from
 * current earnings and saved if it changed, so a request booked before pay
 * was entered (or before a fix) never shows a stale "no pay". Adds how many
 * of the 8 weeks had pay.
 */
export async function withCurrentSmp<
  T extends {
    id: string;
    userId: string;
    status: string;
    startDate: Date;
    expectedDueDate: Date | null;
    matchedDate?: Date | null;
    smpAverageWeeklyEarnings: unknown;
    smpPhase1WeeklyRate: unknown;
    smpPhase2WeeklyRate: unknown;
    leaveType: { name: string };
  },
>(requests: T[]): Promise<Array<T & { smpEarningsWeeks?: number }>> {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return Promise.all(
    requests.map(async (r) => {
      const kind = birthPayKind(r.leaveType.name);
      if (!kind || r.status === "CANCELLED" || r.status === "REJECTED") return r;
      const smp = await computeSmpFields({
        userId: r.userId,
        startDate: r.startDate,
        expectedDueDate: r.expectedDueDate,
        matchedDate: r.matchedDate ?? null,
        kind,
      });
      const changed =
        num(r.smpAverageWeeklyEarnings) !== smp.fields.smpAverageWeeklyEarnings ||
        num(r.smpPhase1WeeklyRate) !== smp.fields.smpPhase1WeeklyRate ||
        num(r.smpPhase2WeeklyRate) !== smp.fields.smpPhase2WeeklyRate;
      if (changed) await prisma.leaveRequest.update({ where: { id: r.id }, data: smp.fields });
      return { ...r, ...smp.fields, smpEarningsWeeks: smp.weeksCounted };
    })
  );
}

/** After earnings change: recalculate SMP and SAP on their live maternity and adoption requests. */
export async function recomputeSmpAfterEarningsChange(userId: string): Promise<number> {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: ["PENDING", "APPROVED"] },
      OR: [
        { leaveType: { name: { contains: "maternity", mode: "insensitive" } } },
        { leaveType: { name: { contains: "adoption", mode: "insensitive" } } },
      ],
    },
    select: { id: true, startDate: true, expectedDueDate: true, matchedDate: true, leaveType: { select: { name: true } } },
  });
  for (const r of requests) {
    const { fields } = await computeSmpFields({
      userId,
      startDate: r.startDate,
      expectedDueDate: r.expectedDueDate,
      matchedDate: r.matchedDate,
      kind: birthPayKind(r.leaveType.name) ?? "SMP",
    });
    await prisma.leaveRequest.update({ where: { id: r.id }, data: fields });
  }
  return requests.length;
}

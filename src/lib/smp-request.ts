import { prisma } from "@/lib/prisma";
import {
  calculatePaternityPay,
  calculateSMPPhaseDates,
  calculateSmpEntitlement,
  getAweDetailForUser,
} from "@/lib/smpCalculator";
import { neonatalWeeksEntitled, weekBeforeNeonatalCare } from "@/lib/neonatalPay";
import { birthPayKind, parentPayDates, payTestWeek, smpEarningsCutoff, type BirthPayKind } from "@/lib/smp-dates";

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
    shppClaimed?: boolean;
    childBirthDate?: Date | null;
    neonatalCareFirstDay?: Date | null;
    neonatalCareLastDay?: Date | null;
    smpAverageWeeklyEarnings: unknown;
    smpPhase1WeeklyRate: unknown;
    smpPhase2WeeklyRate: unknown;
    leaveType: { name: string };
  },
>(
  requests: T[]
): Promise<
  Array<
    T & {
      smpEarningsWeeks?: number;
      /** Shared parental leave: ShPP worked out now (not stored). */
      shpp?: { claimed: boolean; eligible: boolean; weeklyRate: number | null; basis: string; dateKnown: boolean };
      /** Paternity leave: SPP worked out now (not stored). */
      spp?: { eligible: boolean; weeklyRate: number | null; basis: string; dateKnown: boolean };
      /** Neonatal care leave: pay and the weeks the time in care gives (not stored). */
      neonatal?: {
        eligible: boolean;
        weeklyRate: number | null;
        basis: string;
        weeksEntitled: number;
        daysInCare: number;
        stillInCare: boolean;
      };
    }
  >
> {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return Promise.all(
    requests.map(async (r) => {
      if (r.status === "CANCELLED" || r.status === "REJECTED") return r;
      if (/neonatal/i.test(r.leaveType.name)) {
        if (!r.neonatalCareFirstDay) return r;
        const [pay, entitled] = await Promise.all([
          computeSncp({
            userId: r.userId,
            startDate: r.startDate,
            expectedDueDate: r.expectedDueDate,
            matchedDate: r.matchedDate ?? null,
            childBirthDate: r.childBirthDate ?? null,
            careFirstDay: r.neonatalCareFirstDay,
          }),
          Promise.resolve(
            neonatalWeeksEntitled({ firstFullDay: r.neonatalCareFirstDay, lastFullDay: r.neonatalCareLastDay ?? null })
          ),
        ]);
        return {
          ...r,
          neonatal: {
            eligible: pay.eligible,
            weeklyRate: pay.weeklyRate,
            basis: pay.basis,
            weeksEntitled: entitled.weeks,
            daysInCare: entitled.daysInCare,
            stillInCare: entitled.ongoing,
          },
        };
      }
      if (/paternity/i.test(r.leaveType.name)) {
        const pay = await computeSpp({
          userId: r.userId,
          startDate: r.startDate,
          expectedDueDate: r.expectedDueDate,
          matchedDate: r.matchedDate ?? null,
          childBirthDate: r.childBirthDate ?? null,
        });
        return { ...r, spp: { eligible: pay.eligible, weeklyRate: pay.weeklyRate, basis: pay.basis, dateKnown: pay.dateKnown } };
      }
      if (isSharedParentalLeaveType(r.leaveType.name)) {
        if (!r.shppClaimed) {
          return { ...r, shpp: { claimed: false, eligible: false, weeklyRate: null, basis: "Unpaid: no ShPP claimed for these weeks", dateKnown: true } };
        }
        const pay = await computeShpp({
          userId: r.userId,
          startDate: r.startDate,
          expectedDueDate: r.matchedDate ? null : r.expectedDueDate,
          matchedDate: r.matchedDate ?? null,
        });
        return { ...r, shpp: { claimed: true, eligible: pay.eligible, weeklyRate: pay.weeklyRate, basis: pay.basis, dateKnown: pay.dateKnown } };
      }
      const kind = birthPayKind(r.leaveType.name);
      if (!kind) return r;
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

/** Shared parental leave on a leave type name. */
export function isSharedParentalLeaveType(name: string | null | undefined): boolean {
  return !!name && /shared parental|\bSPL\b/i.test(name);
}

/**
 * Paternity pay (SPP) or Shared Parental Pay (ShPP) for one employee: the
 * lower of the flat rate and 90% of average weekly earnings, every week. Same
 * earnings and service tests as SMP or SAP, from the qualifying week (birth,
 * from the due date) or the matching week (adoption).
 * https://www.gov.uk/employers-paternity-pay-leave
 * https://www.gov.uk/shared-parental-leave-and-pay-employer-guide
 */
async function computeWeeklyParentPay(input: {
  userId: string;
  startDate: Date;
  expectedDueDate: Date | null;
  matchedDate: Date | null;
  childBirthDate?: Date | null;
  payName: string;
}) {
  const dates = parentPayDates(input);
  const kind: BirthPayKind = dates.matchedDate ? "SAP" : "SMP";
  const pay = await weeklyParentPayFromWeek({
    userId: input.userId,
    testWeek: payTestWeek({ kind, ...dates }),
    startDate: input.startDate,
    payName: input.payName,
    testWeekName: kind === "SAP" ? "matching week" : "qualifying week",
  });
  return {
    ...pay,
    basis: dates.note ? `${pay.basis.replace(/\.$/, "")}. ${dates.note}` : pay.basis,
    dateKnown: !!(dates.expectedDueDate || dates.matchedDate),
  };
}

/**
 * The lower of the flat rate and 90% of earnings, with earnings from the 8
 * weeks up to `testWeek` and 26 weeks' service into it (the leave start when
 * there's no week).
 */
async function weeklyParentPayFromWeek(input: {
  userId: string;
  testWeek: { start: Date; end: Date } | null;
  startDate: Date;
  payName: string;
  testWeekName: string;
}) {
  const cutoff = input.testWeek ? new Date(input.testWeek.end.getTime() + 86_400_000) : input.startDate;
  const [{ awe, weeksCounted }, employee] = await Promise.all([
    getAweDetailForUser(input.userId, cutoff),
    prisma.user.findUnique({ where: { id: input.userId }, select: { serviceStartDate: true } }),
  ]);
  const pay = calculatePaternityPay(awe, {
    serviceStartDate: employee?.serviceStartDate ?? null,
    serviceTestWeek: input.testWeek,
    payName: input.payName,
    testWeekName: input.testWeekName,
  });
  return { ...pay, averageWeeklyEarnings: awe, weeksCounted };
}

/**
 * Statutory Neonatal Care Pay: the lower of the flat rate and 90% of
 * earnings. The earnings and service week is the qualifying week (birth) or
 * matching week (adoption) when they're entitled to SMP, SPP or SAP — taken
 * here as passing those same tests there — otherwise the week before the
 * baby went into neonatal care.
 * https://www.gov.uk/employers-neonatal-care-pay-leave/eligibility
 */
export async function computeSncp(input: {
  userId: string;
  startDate: Date;
  expectedDueDate: Date | null;
  matchedDate: Date | null;
  childBirthDate: Date | null;
  careFirstDay: Date | null;
}) {
  const payName = "neonatal care pay";
  const primary = await computeWeeklyParentPay({ ...input, payName });
  if (primary.dateKnown && primary.eligible) {
    return {
      ...primary,
      basis: `${primary.basis.replace(/\.$/, "")}, from the ${input.matchedDate ? "matching" : "qualifying"} week (entitled to ${input.matchedDate ? "SAP" : "SMP or SPP"})`,
    };
  }
  if (!input.careFirstDay) return primary;
  const week = weekBeforeNeonatalCare(input.careFirstDay);
  const fallback = await weeklyParentPayFromWeek({
    userId: input.userId,
    testWeek: week,
    startDate: input.startDate,
    payName,
    testWeekName: "week before neonatal care began",
  });
  return {
    ...fallback,
    basis: fallback.eligible
      ? `${fallback.basis}, from the week before neonatal care began`
      : fallback.basis,
    dateKnown: true,
  };
}

/** Statutory Shared Parental Pay (see computeWeeklyParentPay). */
export function computeShpp(input: {
  userId: string;
  startDate: Date;
  expectedDueDate: Date | null;
  matchedDate: Date | null;
}) {
  return computeWeeklyParentPay({ ...input, payName: "shared parental pay" });
}

/** Statutory Paternity Pay (see computeWeeklyParentPay). */
export function computeSpp(input: {
  userId: string;
  startDate: Date;
  expectedDueDate: Date | null;
  matchedDate: Date | null;
  childBirthDate: Date | null;
}) {
  return computeWeeklyParentPay({ ...input, payName: "paternity pay" });
}

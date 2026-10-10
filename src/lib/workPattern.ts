import { prisma } from "@/lib/prisma";

/** Today's date in the UK as YYYY-MM-DD, independent of server timezone. */
export function ukToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

/** A YYYY-MM-DD string as the UTC-midnight Date Prisma expects for @db.Date. */
export function dbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * Operations that end a member's working pattern as of `today` (a dbDate):
 * rows that never took effect are deleted, rows in effect close yesterday so
 * past cover stays accurate. Run inside a $transaction.
 */
export function endWorkPatternOps(userId: string, today: Date, db: Pick<typeof prisma, "workPattern"> = prisma) {
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  return [
    db.workPattern.deleteMany({
      where: { userId, effectiveFrom: { gte: today } },
    }),
    db.workPattern.updateMany({
      where: {
        userId,
        effectiveFrom: { lt: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      data: { effectiveTo: yesterday },
    }),
  ];
}

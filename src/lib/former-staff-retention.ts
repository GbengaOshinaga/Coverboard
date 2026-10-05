import { prisma } from "@/lib/prisma";

/** Holiday records: kept 6 years from when they were made (Employment Rights Act 2025). */
export const HOLIDAY_RECORD_YEARS = 6;
/** Right-to-work check records: during employment and 2 years after (Home Office). */
export const RIGHT_TO_WORK_YEARS_AFTER_LEAVING = 2;

function yearsAgo(n: number, now: Date): Date {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - n);
  return d;
}

/**
 * People who've left are kept while the law needs their records, then
 * removed: right-to-work checks 2 years after leaving, everything else
 * (leave, holiday pay, carry-over, earnings) 6 years after leaving, by which
 * time every holiday record of theirs is past 6 years. Runs nightly; also
 * from the admin retention endpoint. `organizationId` limits it to one team.
 */
export async function removeFormerStaffPastRetention(opts: {
  now?: Date;
  organizationId?: string;
  dryRun?: boolean;
}): Promise<{ formerStaff: number; rightToWorkChecks: number }> {
  const now = opts.now ?? new Date();
  const org = opts.organizationId ? { organizationId: opts.organizationId } : {};
  const leftBefore = (years: number) => ({ ...org, isActive: false, leftOn: { lt: yearsAgo(years, now) } });

  if (opts.dryRun) {
    const [formerStaff, rightToWorkChecks] = await Promise.all([
      prisma.user.count({ where: leftBefore(HOLIDAY_RECORD_YEARS) }),
      prisma.rightToWorkCheck.count({ where: { user: leftBefore(RIGHT_TO_WORK_YEARS_AFTER_LEAVING) } }),
    ]);
    return { formerStaff, rightToWorkChecks };
  }
  const rightToWorkChecks = (
    await prisma.rightToWorkCheck.deleteMany({ where: { user: leftBefore(RIGHT_TO_WORK_YEARS_AFTER_LEAVING) } })
  ).count;
  const formerStaff = (await prisma.user.deleteMany({ where: leftBefore(HOLIDAY_RECORD_YEARS) })).count;
  return { formerStaff, rightToWorkChecks };
}

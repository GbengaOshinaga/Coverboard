import { prisma } from "@/lib/prisma";
import { getUserLeaveBalances } from "@/lib/leave-balances";
import { getLeaveYearStart } from "@/lib/leave-year-server";
import { leaveYearBounds, leaveYearLabel, leaveYearOf } from "@/lib/leave-year";
import { getDailyHolidayPayRateForUser, getHourlyHolidayPayRateForUser } from "@/lib/holidayPay";
import { holidayOnLeaving, type HolidayOnLeaving } from "@/lib/holiday-on-leaving";

export type HolidayOnLeavingReport = HolidayOnLeaving & {
  lastDay: string;
  leaveYear: string;
  /** Bank holidays given on top of the allowance, counted in (team setting). */
  bankHolidaysOnTop: { inYear: number; byLastDay: number } | null;
  /** Leave still waiting for approval before the last day (not counted as taken). */
  pending: number;
  /** 52-week average holiday pay rate (per day, or per hour for hours staff). */
  rate: number | null;
  /** owed × rate when there's something to pay. */
  pay: number | null;
};

/**
 * Holiday on leaving for someone with a leaving date (src/lib/holiday-on-leaving.ts):
 * the leave year their last day falls in, from their annual leave balance.
 */
export async function getHolidayOnLeaving(userId: string): Promise<HolidayOnLeavingReport | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { leftOn: true, serviceStartDate: true, organizationId: true, workCountry: true },
  });
  if (!user?.leftOn) return null;

  const start = await getLeaveYearStart(user.organizationId);
  const year = leaveYearOf(user.leftOn, start);
  const { start: yearStart, end: yearEnd } = leaveYearBounds(year, start);
  const balances = await getUserLeaveBalances(userId, year);
  const annual = balances.find((b) => b.leaveTypeName === "Annual Leave") ?? balances.find((b) => /annual/i.test(b.leaveTypeName));
  if (!annual) return null;

  const employedFrom = user.serviceStartDate && user.serviceStartDate > yearStart ? user.serviceStartDate : yearStart;

  // Teams that give bank holidays on top: the allowance had them taken off,
  // so they go back into the entitlement, and those up to the last day count
  // as taken (the same bank holidays the balance subtracted).
  let bankHolidaysOnTop: HolidayOnLeavingReport["bankHolidaysOnTop"] = null;
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { ukBankHolidayInclusive: true, ukBankHolidayRegion: true },
  });
  if (user.workCountry === "GB" && org && !org.ukBankHolidayInclusive && annual.unit === "days") {
    const count = (to: Date) =>
      prisma.bankHoliday.count({
        where: { organizationId: user.organizationId, region: org.ukBankHolidayRegion, date: { gte: employedFrom, lte: to } },
      });
    const [inYear, byLastDay] = await Promise.all([count(yearEnd), count(user.leftOn)]);
    bankHolidaysOnTop = { inYear, byLastDay };
  }

  const result = holidayOnLeaving({
    unit: annual.unit,
    yearEntitlement: annual.allowance - annual.carryOver.inAllowance + (bankHolidaysOnTop?.inYear ?? 0),
    carriedOver: annual.carryOver.inAllowance,
    taken: annual.used + (bankHolidaysOnTop?.byLastDay ?? 0),
    employedFrom,
    yearEnd,
    lastDay: user.leftOn,
  });

  const rate =
    annual.unit === "hours" ? await getHourlyHolidayPayRateForUser(userId) : await getDailyHolidayPayRateForUser(userId);
  return {
    ...result,
    lastDay: user.leftOn.toISOString().slice(0, 10),
    leaveYear: leaveYearLabel(year, start),
    bankHolidaysOnTop,
    pending: annual.pending,
    rate,
    pay: rate !== null && result.owed > 0 ? Math.round(result.owed * rate * 100) / 100 : null,
  };
}

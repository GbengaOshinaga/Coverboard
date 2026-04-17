import { prisma } from "@/lib/prisma";
import { countWeekdays } from "@/lib/utils";
import { calculateUkProRatedAnnualLeave } from "@/lib/uk-compliance";

export type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  allowance: number;
  proRatedEntitlement?: number;
  used: number;
  pending: number;
  remaining: number;
  carryOver: {
    carried: number;
    remaining: number;
    expiresAt: string | null;
  };
};

/**
 * Calculate leave balances for a user for a given year.
 *
 * For each leave type in the org:
 * 1. Look up the country-specific policy allowance (LeavePolicy for user's countryCode)
 * 2. Fall back to the leave type's defaultDays if no policy exists
 * 3. Sum weekdays from all APPROVED requests in that year = "used"
 * 4. Sum weekdays from all PENDING requests in that year = "pending"
 * 5. remaining = allowance - used - pending
 */
export async function getUserLeaveBalances(
  userId: string,
  year: number
): Promise<LeaveBalance[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      countryCode: true,
      organizationId: true,
      employmentType: true,
      daysWorkedPerWeek: true,
      weeklyHours: {
        orderBy: { weekStartDate: "asc" },
        select: { hoursWorked: true },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const orgUk = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      ukBankHolidayInclusive: true,
      ukBankHolidayRegion: true,
    },
  });
  const ukBankHolidayInclusive = orgUk?.ukBankHolidayInclusive ?? true;
  const ukBankHolidayRegion = orgUk?.ukBankHolidayRegion ?? "ENGLAND_WALES";

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  const carryOverBalances = await prisma.leaveCarryOverBalance.findMany({
    where: {
      userId,
      leaveYear: year,
    },
    select: {
      leaveTypeId: true,
      daysCarried: true,
      daysRemaining: true,
      expiresAt: true,
    },
  });

  let ukRegionalBankHolidayCount = 0;
  if (user.countryCode === "GB" && !ukBankHolidayInclusive) {
    ukRegionalBankHolidayCount = await prisma.bankHoliday.count({
      where: {
        organizationId: user.organizationId,
        region: ukBankHolidayRegion,
        date: {
          gte: yearStart,
          lte: yearEnd,
        },
      },
    });
  }

  // Fetch leave types for the org, including country-specific policies
  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId: user.organizationId },
    include: {
      leavePolicies: {
        where: { countryCode: user.countryCode },
      },
    },
    orderBy: { name: "asc" },
  });

  // Fetch all of this user's leave requests for the year (approved + pending)
  const requests = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: yearEnd },
      endDate: { gte: yearStart },
    },
    select: {
      leaveTypeId: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  });

  return leaveTypes.map((lt) => {
    const policy = lt.leavePolicies[0];
    const baseAllowance = policy?.annualAllowance ?? lt.defaultDays;
    let allowance = baseAllowance;
    let proRatedEntitlement: number | undefined;

    if (user.countryCode === "GB" && lt.name === "Annual Leave") {
      proRatedEntitlement = calculateUkProRatedAnnualLeave({
        employmentType: user.employmentType,
        daysWorkedPerWeek: user.daysWorkedPerWeek,
        weeklyHours: user.weeklyHours.map((h) => h.hoursWorked),
      });
      allowance = proRatedEntitlement;
      if (!ukBankHolidayInclusive) {
        allowance += ukRegionalBankHolidayCount;
      }
    }

    const carryOver = carryOverBalances.find((c) => c.leaveTypeId === lt.id);
    const carryOverRemaining = carryOver?.daysRemaining ?? 0;
    allowance += carryOverRemaining;

    let used = 0;
    let pending = 0;

    for (const req of requests) {
      if (req.leaveTypeId !== lt.id) continue;

      const start = req.startDate < yearStart ? yearStart : req.startDate;
      const end = req.endDate > yearEnd ? yearEnd : req.endDate;
      const days = countWeekdays(start, end);

      if (req.status === "APPROVED") {
        used += days;
      } else {
        pending += days;
      }
    }

    return {
      leaveTypeId: lt.id,
      leaveTypeName: lt.name,
      leaveTypeColor: lt.color,
      allowance,
      proRatedEntitlement,
      used,
      pending,
      remaining: Math.max(0, allowance - used - pending),
      carryOver: {
        carried: carryOver?.daysCarried ?? 0,
        remaining: carryOverRemaining,
        expiresAt: carryOver?.expiresAt?.toISOString() ?? null,
      },
    };
  });
}

/**
 * Get the balance for a single leave type for a user.
 * Useful for quick checks when submitting a request.
 */
export async function getUserLeaveBalance(
  userId: string,
  leaveTypeId: string,
  year: number
): Promise<LeaveBalance | null> {
  const balances = await getUserLeaveBalances(userId, year);
  return balances.find((b) => b.leaveTypeId === leaveTypeId) ?? null;
}

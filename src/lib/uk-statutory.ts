import { prisma } from "@/lib/prisma";
import { getCountryPolicies } from "@/lib/country-policies";
import { addUkBankHolidays, holidayYears } from "@/lib/holiday-years";

export async function hasUkStatutoryLeaveTypes(
  organizationId: string
): Promise<boolean> {
  const count = await prisma.leaveType.count({
    where: {
      organizationId,
      OR: [
        { name: "Statutory Sick Pay (SSP)" },
        { name: "Statutory Maternity Leave" },
      ],
    },
  });
  return count > 0;
}

/**
 * Adds the UK statutory leave types, their policies and bank holidays.
 * `onlyAddMissing` leaves existing types and policies exactly as the team set
 * them and only creates new ones: for backfilling types added to the GB list
 * later, without resetting a team's own allowances.
 */
export async function enableUkStatutoryLeaveTypes(
  organizationId: string,
  options: { onlyAddMissing?: boolean } = {}
): Promise<void> {
  const keep = options.onlyAddMissing === true;
  const ukPolicies = getCountryPolicies(["GB"]);
  const byLeaveType = new Map(
    ukPolicies.map((p) => [p.leaveType, p] as const)
  );

  await Promise.all(
    Array.from(byLeaveType).map(([leaveTypeName, p]) =>
    prisma.leaveType.upsert({
      where: {
        name_organizationId: { name: leaveTypeName, organizationId },
      },
      create: {
        name: leaveTypeName,
        color:
          leaveTypeName === "Statutory Sick Pay (SSP)"
            ? "#ef4444"
            : leaveTypeName === "Statutory Maternity Leave"
              ? "#8b5cf6"
              : "#3b82f6",
        isPaid: p.category !== "UNPAID",
        category: p.category,
        defaultDays: p.annualAllowance,
        allowanceUnit: p.allowanceUnit ?? "DAYS",
        requiresEvidence: p.requiresEvidence,
        minNoticeDays: p.minNoticeDays,
        durationLogic: p.durationLogic,
        applyProRata: p.applyProRata ?? false,
        countryCode: "GB",
        organizationId,
      },
      update: keep
        ? {}
        : {
            isPaid: p.category !== "UNPAID",
            category: p.category,
            defaultDays: p.annualAllowance,
            allowanceUnit: p.allowanceUnit ?? "DAYS",
            requiresEvidence: p.requiresEvidence,
            minNoticeDays: p.minNoticeDays,
            durationLogic: p.durationLogic,
            applyProRata: p.applyProRata ?? false,
            countryCode: "GB",
          },
    })
    )
  );

  const gbLeaveTypes = await prisma.leaveType.findMany({
    where: { organizationId, countryCode: "GB" },
    select: { id: true, name: true },
  });

  await Promise.all(
    gbLeaveTypes.map((lt) => {
      const p = byLeaveType.get(lt.name);
      if (!p) return null;
      return prisma.leavePolicy.upsert({
        where: {
          countryCode_leaveTypeId: { countryCode: "GB", leaveTypeId: lt.id },
        },
        create: {
          countryCode: "GB",
          annualAllowance: p.annualAllowance,
          carryOverMax: p.carryOverMax,
          leaveTypeId: lt.id,
        },
        update: keep
          ? {}
          : {
              annualAllowance: p.annualAllowance,
              carryOverMax: p.carryOverMax,
            },
      });
    })
  );

  // This year and next; the monthly job adds later years (holiday-years.ts).
  await addUkBankHolidays(organizationId, holidayYears());
}

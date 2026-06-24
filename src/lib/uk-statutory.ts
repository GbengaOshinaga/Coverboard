import { BankHolidayRegion } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCountryPolicies } from "@/lib/country-policies";
import { getUkBankHolidaysForRegion } from "@/lib/uk-compliance";

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

export async function enableUkStatutoryLeaveTypes(
  organizationId: string
): Promise<void> {
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
        requiresEvidence: p.requiresEvidence,
        minNoticeDays: p.minNoticeDays,
        durationLogic: p.durationLogic,
        applyProRata: p.applyProRata ?? false,
        countryCode: "GB",
        organizationId,
      },
      update: {
        isPaid: p.category !== "UNPAID",
        category: p.category,
        defaultDays: p.annualAllowance,
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
        update: {
          annualAllowance: p.annualAllowance,
          carryOverMax: p.carryOverMax,
        },
      });
    })
  );

  // Seed two years × three regions of bank holidays in ONE insert. The upsert
  // bodies were no-op updates, so createMany with skipDuplicates is equivalent
  // for fresh orgs and safe on re-sync (existing rows are skipped) — and turns
  // ~60 round-trips into a single query.
  const currentYear = new Date().getFullYear();
  const ukRegions: BankHolidayRegion[] = [
    "ENGLAND_WALES",
    "SCOTLAND",
    "NORTHERN_IRELAND",
  ];
  const bankHolidayRows = [currentYear, currentYear + 1].flatMap((year) =>
    ukRegions.flatMap((region) =>
      getUkBankHolidaysForRegion(year, region).map((holiday) => ({
        name: holiday.name,
        date: holiday.date,
        region,
        countryCode: "GB",
        organizationId,
      }))
    )
  );
  await prisma.bankHoliday.createMany({
    data: bankHolidayRows,
    skipDuplicates: true,
  });
}

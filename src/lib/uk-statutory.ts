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

  for (const [leaveTypeName, p] of byLeaveType) {
    await prisma.leaveType.upsert({
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
        countryCode: "GB",
      },
    });
  }

  const gbLeaveTypes = await prisma.leaveType.findMany({
    where: { organizationId, countryCode: "GB" },
    select: { id: true, name: true },
  });

  for (const lt of gbLeaveTypes) {
    const p = byLeaveType.get(lt.name);
    if (!p) continue;
    await prisma.leavePolicy.upsert({
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
  }

  const currentYear = new Date().getFullYear();
  const ukRegions: BankHolidayRegion[] = [
    "ENGLAND_WALES",
    "SCOTLAND",
    "NORTHERN_IRELAND",
  ];
  for (const year of [currentYear, currentYear + 1]) {
    for (const region of ukRegions) {
      const holidays = getUkBankHolidaysForRegion(year, region);
      for (const holiday of holidays) {
        await prisma.bankHoliday.upsert({
          where: {
            date_region_organizationId: {
              date: holiday.date,
              region,
              organizationId,
            },
          },
          create: {
            name: holiday.name,
            date: holiday.date,
            region,
            countryCode: "GB",
            organizationId,
          },
          update: {},
        });
      }
    }
  }
}

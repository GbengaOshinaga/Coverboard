import type { BankHolidayRegion } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUkBankHolidaysForRegion } from "@/lib/uk-compliance";
import { getHolidaysForYear } from "@/lib/country-policies";

/**
 * Bank and public holidays are stored per team, a year at a time: setting a
 * team up adds this year and next, and the monthly job (cron/holidays) adds
 * the next year as each new one starts, so a team never runs out. Holidays
 * feed the calendar, holiday balances (bank-holiday-exclusive teams) and
 * cover checks.
 */

const UK_REGIONS: BankHolidayRegion[] = ["ENGLAND_WALES", "SCOTLAND", "NORTHERN_IRELAND"];

/** This year and next: what every team should always have. */
export function holidayYears(now: Date = new Date()): number[] {
  const y = now.getUTCFullYear();
  return [y, y + 1];
}

/** UK bank holidays, all three nations, for the given years. Existing rows are left alone. */
export async function addUkBankHolidays(organizationId: string, years: number[]): Promise<number> {
  const rows = years.flatMap((year) =>
    UK_REGIONS.flatMap((region) =>
      getUkBankHolidaysForRegion(year, region).map((h) => ({
        name: h.name,
        date: h.date,
        region,
        countryCode: "GB",
        organizationId,
      }))
    )
  );
  const { count } = await prisma.bankHoliday.createMany({ data: rows, skipDuplicates: true });
  return count;
}

/** Public holidays for non-UK countries, for the given years. Existing rows are left alone. */
export async function addPublicHolidays(organizationId: string, countryCodes: string[], years: number[]): Promise<number> {
  const codes = countryCodes.filter((c) => c !== "GB");
  if (codes.length === 0) return 0;
  const rows = years.flatMap((year) =>
    getHolidaysForYear(codes, year).map((h) => ({
      name: h.name,
      date: h.date,
      countryCode: h.countryCode,
      organizationId,
    }))
  );
  const { count } = await prisma.publicHoliday.createMany({ data: rows, skipDuplicates: true });
  return count;
}

/**
 * Adds any missing years for every team: UK bank holidays for teams that have
 * them, and public holidays for each country a team already has holidays for.
 */
export async function topUpHolidaysForAllTeams(now: Date = new Date()) {
  const years = holidayYears(now);
  const [ukTeams, countries] = await Promise.all([
    prisma.bankHoliday.findMany({ distinct: ["organizationId"], select: { organizationId: true } }),
    prisma.publicHoliday.findMany({
      distinct: ["organizationId", "countryCode"],
      select: { organizationId: true, countryCode: true },
    }),
  ]);
  let bankHolidaysAdded = 0;
  let publicHolidaysAdded = 0;
  for (const { organizationId } of ukTeams) {
    bankHolidaysAdded += await addUkBankHolidays(organizationId, years);
  }
  const byTeam = new Map<string, string[]>();
  for (const { organizationId, countryCode } of countries) {
    byTeam.set(organizationId, [...(byTeam.get(organizationId) ?? []), countryCode]);
  }
  for (const [organizationId, codes] of byTeam) {
    publicHolidaysAdded += await addPublicHolidays(organizationId, codes, years);
  }
  return { years, ukTeams: ukTeams.length, teamsWithPublicHolidays: byTeam.size, bankHolidaysAdded, publicHolidaysAdded };
}

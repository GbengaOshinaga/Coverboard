import { countWeekdays } from "@/lib/utils";

/**
 * Mirrors Prisma enums `EmploymentType` and `BankHolidayRegion` (same string values).
 * Defined here so this file does not depend on generated `@prisma/client` types.
 */
export const EmploymentType = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  VARIABLE_HOURS: "VARIABLE_HOURS",
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const BankHolidayRegion = {
  ENGLAND_WALES: "ENGLAND_WALES",
  SCOTLAND: "SCOTLAND",
  NORTHERN_IRELAND: "NORTHERN_IRELAND",
} as const;
export type BankHolidayRegion =
  (typeof BankHolidayRegion)[keyof typeof BankHolidayRegion];

const DEFAULT_SSP_WEEKLY_RATE = 116.75;
const DEFAULT_SMP_WEEKLY_RATE = 184.03;

export const UK_SSP_WEEKLY_RATE = Number(
  process.env.SSP_WEEKLY_RATE ?? DEFAULT_SSP_WEEKLY_RATE
);
export const UK_SMP_WEEKLY_RATE = Number(
  process.env.SMP_WEEKLY_RATE ?? DEFAULT_SMP_WEEKLY_RATE
);

export type UKContractInput = {
  employmentType: EmploymentType;
  daysWorkedPerWeek: number;
  weeklyHours: number[];
};

export function calculateVariableHoursFte(weeklyHours: number[]): number {
  if (weeklyHours.length === 0) return 1;
  const recent52 = weeklyHours.slice(-52);
  const average = recent52.reduce((sum, h) => sum + h, 0) / recent52.length;
  const fte = average / 37.5;
  return Number(Math.max(0, Math.min(1, fte)).toFixed(3));
}

export function calculateUkProRatedAnnualLeave(input: UKContractInput): number {
  if (input.employmentType === EmploymentType.PART_TIME) {
    return Number(((input.daysWorkedPerWeek / 5) * 28).toFixed(2));
  }
  if (input.employmentType === EmploymentType.VARIABLE_HOURS) {
    return Number((calculateVariableHoursFte(input.weeklyHours) * 28).toFixed(2));
  }
  return 28;
}

export function calculateBradfordFactor(absenceSpells: number, absenceDays: number): number {
  return absenceSpells * absenceSpells * absenceDays;
}

export function calculateSspPayableDays(startDate: Date, endDate: Date): number {
  const consecutiveDays = countWeekdays(startDate, endDate);
  if (consecutiveDays <= 3) return 0;
  return consecutiveDays - 3;
}

export function calculateEstimatedSspCost(startDate: Date, endDate: Date, weeklyRate = UK_SSP_WEEKLY_RATE): number {
  const payableDays = calculateSspPayableDays(startDate, endDate);
  return Number(((weeklyRate / 7) * payableDays).toFixed(2));
}

type BankHolidayEntry = {
  name: string;
  date: string;
};

const UK_BANK_HOLIDAYS: Record<number, Record<BankHolidayRegion, BankHolidayEntry[]>> = {
  2026: {
    ENGLAND_WALES: [
      { name: "New Year's Day", date: "2026-01-01" },
      { name: "Good Friday", date: "2026-04-03" },
      { name: "Easter Monday", date: "2026-04-06" },
      { name: "Early May bank holiday", date: "2026-05-04" },
      { name: "Spring bank holiday", date: "2026-05-25" },
      { name: "Summer bank holiday", date: "2026-08-31" },
      { name: "Christmas Day", date: "2026-12-25" },
      { name: "Boxing Day (substitute)", date: "2026-12-28" },
    ],
    SCOTLAND: [
      { name: "New Year's Day", date: "2026-01-01" },
      { name: "2nd January", date: "2026-01-02" },
      { name: "Good Friday", date: "2026-04-03" },
      { name: "Early May bank holiday", date: "2026-05-04" },
      { name: "Spring bank holiday", date: "2026-05-25" },
      { name: "Summer bank holiday", date: "2026-08-03" },
      { name: "St Andrew's Day", date: "2026-11-30" },
      { name: "Christmas Day", date: "2026-12-25" },
      { name: "Boxing Day (substitute)", date: "2026-12-28" },
    ],
    NORTHERN_IRELAND: [
      { name: "New Year's Day", date: "2026-01-01" },
      { name: "St Patrick's Day", date: "2026-03-17" },
      { name: "Good Friday", date: "2026-04-03" },
      { name: "Easter Monday", date: "2026-04-06" },
      { name: "Early May bank holiday", date: "2026-05-04" },
      { name: "Spring bank holiday", date: "2026-05-25" },
      { name: "Battle of the Boyne (Orangemen's Day) (substitute)", date: "2026-07-13" },
      { name: "Summer bank holiday", date: "2026-08-31" },
      { name: "Christmas Day", date: "2026-12-25" },
      { name: "Boxing Day (substitute)", date: "2026-12-28" },
    ],
  },
  2027: {
    ENGLAND_WALES: [
      { name: "New Year's Day", date: "2027-01-01" },
      { name: "Good Friday", date: "2027-03-26" },
      { name: "Easter Monday", date: "2027-03-29" },
      { name: "Early May bank holiday", date: "2027-05-03" },
      { name: "Spring bank holiday", date: "2027-05-31" },
      { name: "Summer bank holiday", date: "2027-08-30" },
      { name: "Christmas Day (substitute)", date: "2027-12-27" },
      { name: "Boxing Day (substitute)", date: "2027-12-28" },
    ],
    SCOTLAND: [
      { name: "New Year's Day", date: "2027-01-01" },
      { name: "2nd January (substitute)", date: "2027-01-04" },
      { name: "Good Friday", date: "2027-03-26" },
      { name: "Early May bank holiday", date: "2027-05-03" },
      { name: "Spring bank holiday", date: "2027-05-31" },
      { name: "Summer bank holiday", date: "2027-08-02" },
      { name: "St Andrew's Day", date: "2027-11-30" },
      { name: "Christmas Day (substitute)", date: "2027-12-27" },
      { name: "Boxing Day (substitute)", date: "2027-12-28" },
    ],
    NORTHERN_IRELAND: [
      { name: "New Year's Day", date: "2027-01-01" },
      { name: "St Patrick's Day", date: "2027-03-17" },
      { name: "Good Friday", date: "2027-03-26" },
      { name: "Easter Monday", date: "2027-03-29" },
      { name: "Early May bank holiday", date: "2027-05-03" },
      { name: "Spring bank holiday", date: "2027-05-31" },
      { name: "Battle of the Boyne (Orangemen's Day)", date: "2027-07-12" },
      { name: "Summer bank holiday", date: "2027-08-30" },
      { name: "Christmas Day (substitute)", date: "2027-12-27" },
      { name: "Boxing Day (substitute)", date: "2027-12-28" },
    ],
  },
};

export function getUkBankHolidaysForRegion(year: number, region: BankHolidayRegion): { name: string; date: Date; region: BankHolidayRegion }[] {
  const byYear = UK_BANK_HOLIDAYS[year];
  if (!byYear) return [];
  return byYear[region].map((h) => ({
    name: h.name,
    date: new Date(`${h.date}T00:00:00.000Z`),
    region,
  }));
}

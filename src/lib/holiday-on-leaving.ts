/**
 * Holiday on leaving, defined once (client-safe). Working Time Regulations
 * reg 14: pay in lieu of leave built up but not taken, (A × B) − C, where A is
 * the year's entitlement, B the share of the leave year that's passed by the
 * last day and C the leave taken; plus leave carried over from earlier years
 * that's still owed (reg 14(6)). Taking more than built up can only be
 * recovered if agreed in writing beforehand.
 * https://www.legislation.gov.uk/uksi/1998/1833/regulation/14
 * https://www.gov.uk/holiday-entitlement-rights/taking-holiday-before-leaving-a-job
 */

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const daysInclusive = (a: Date, b: Date) => Math.floor((utcDay(b).getTime() - utcDay(a).getTime()) / DAY_MS) + 1;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type HolidayOnLeaving = {
  unit: "days" | "hours";
  /** The year's entitlement (already their share if they started part-way). */
  yearEntitlement: number;
  /** Share of their part of the leave year that's passed by the last day (1 for hours accrual). */
  proportion: number;
  /** Built up this year by the last day. */
  accrued: number;
  /** Carried over from earlier years and still owed. */
  carriedOver: number;
  taken: number;
  /** Positive: to pay. Negative: taken more than built up. */
  owed: number;
};

export function holidayOnLeaving(input: {
  unit: "days" | "hours";
  /** This year's allowance, without carry-over. */
  yearEntitlement: number;
  /** Carry-over still available or used this year (lapsed carry-over excluded). */
  carriedOver: number;
  /** Leave taken this year (carry-over and this year's). */
  taken: number;
  /** Start of their part of the leave year: the year start, or their start date if later. */
  employedFrom: Date;
  yearEnd: Date;
  lastDay: Date;
}): HolidayOnLeaving {
  // Hours accrual (12.07% of hours worked) is already what's built up.
  const proportion =
    input.unit === "hours"
      ? 1
      : Math.min(1, Math.max(0, daysInclusive(input.employedFrom, input.lastDay) / daysInclusive(input.employedFrom, input.yearEnd)));
  const accrued = round2(input.yearEntitlement * proportion);
  return {
    unit: input.unit,
    yearEntitlement: input.yearEntitlement,
    proportion: Math.round(proportion * 10000) / 10000,
    accrued,
    carriedOver: round2(input.carriedOver),
    taken: round2(input.taken),
    owed: round2(accrued + input.carriedOver - input.taken),
  };
}

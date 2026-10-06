import { countWorkingDays } from "@/lib/working-week";

/**
 * Unpaid parental leave (https://www.gov.uk/parental-leave): up to 18 weeks
 * for each child before their 18th birthday, and at most 4 weeks for each
 * child in a year. A week is the person's normal working week, so days are
 * counted on the days they work.
 *
 * The "year" is the child's own, not the calendar or leave year: 12 months
 * from when the employee first became entitled for that child (the later of
 * the birth and a year's service), then each anniversary (the default scheme,
 * Maternity and Parental Leave etc. Regulations 1999, Schedule 2 paras 8–9).
 * https://www.legislation.gov.uk/uksi/1999/3312/schedule/2
 */
export const UPL_WEEKS_PER_CHILD = 18;
export const UPL_WEEKS_PER_CHILD_PER_YEAR = 4;

type Range = { startDate: Date; endDate: Date };

export function eighteenthBirthday(dateOfBirth: Date): Date {
  return new Date(
    Date.UTC(dateOfBirth.getUTCFullYear() + 18, dateOfBirth.getUTCMonth(), dateOfBirth.getUTCDate())
  );
}

const addYears = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()));

/**
 * When the employee became entitled for this child: the later of the birth
 * and a year's service (birth alone when the start date isn't recorded).
 */
export function uplEntitledFrom(dateOfBirth: Date, serviceStartDate: Date | null): Date {
  const dob = addYears(dateOfBirth, 0);
  if (!serviceStartDate) return dob;
  const oneYearService = addYears(serviceStartDate, 1);
  return oneYearService > dob ? oneYearService : dob;
}

/** The child's parental-leave year containing a date (first and last day). */
export function uplYearContaining(date: Date, entitledFrom: Date): { start: Date; end: Date } {
  let n = date.getUTCFullYear() - entitledFrom.getUTCFullYear();
  if (addYears(entitledFrom, n) > date) n -= 1;
  const start = addYears(entitledFrom, n);
  return { start, end: new Date(addYears(entitledFrom, n + 1).getTime() - 86_400_000) };
}

export type UplUsage = {
  /** Working days used for this child in the child's current year. */
  daysThisYear: number;
  /** Working days used for this child in total, including other employers. */
  daysTotal: number;
  capThisYear: number;
  capTotal: number;
};

export function uplUsage(input: {
  /** Live (pending or approved) bookings for this child. */
  bookings: Range[];
  /** The child's year (uplYearContaining). */
  year: { start: Date; end: Date };
  weeksTakenElsewhere: number;
  daysPerWeek: number;
  weekdays: number[] | null;
}): UplUsage {
  const { start: yearStart, end: yearEnd } = input.year;
  let daysThisYear = 0;
  let daysHere = 0;
  for (const b of input.bookings) {
    daysHere += countWorkingDays(b.startDate, b.endDate, input.weekdays);
    const from = b.startDate > yearStart ? b.startDate : yearStart;
    const to = b.endDate < yearEnd ? b.endDate : yearEnd;
    if (from <= to) daysThisYear += countWorkingDays(from, to, input.weekdays);
  }
  return {
    daysThisYear,
    daysTotal: daysHere + input.weeksTakenElsewhere * input.daysPerWeek,
    capThisYear: UPL_WEEKS_PER_CHILD_PER_YEAR * input.daysPerWeek,
    capTotal: UPL_WEEKS_PER_CHILD * input.daysPerWeek,
  };
}

/**
 * Checks a new unpaid parental leave booking for one child. Returns an error
 * message, or null when it's within the limits.
 */
export function uplError(input: {
  childName: string;
  dateOfBirth: Date;
  /** Employment start, for when entitlement began (null if not recorded). */
  serviceStartDate: Date | null;
  request: Range;
  /** The child's other live bookings (not this one). */
  bookings: Range[];
  weeksTakenElsewhere: number;
  daysPerWeek: number;
  weekdays: number[] | null;
}): string | null {
  const { request, childName } = input;
  const birthday18 = eighteenthBirthday(input.dateOfBirth);
  if (request.endDate >= birthday18) {
    return `Unpaid parental leave for ${childName} has to end before their 18th birthday (${birthday18
      .toISOString()
      .slice(0, 10)}).`;
  }
  if (request.startDate < input.dateOfBirth) {
    return `Unpaid parental leave for ${childName} can't start before their date of birth.`;
  }

  const entitledFrom = uplEntitledFrom(input.dateOfBirth, input.serviceStartDate);
  const all = [...input.bookings, request];
  const firstYear = uplYearContaining(request.startDate, entitledFrom);
  const total = uplUsage({ ...input, bookings: all, year: firstYear });
  if (total.daysTotal > total.capTotal) {
    const before = uplUsage({ ...input, year: firstYear });
    return `That's more than the ${UPL_WEEKS_PER_CHILD} weeks (${total.capTotal} working days) of unpaid parental leave for ${childName}. ${Math.max(
      0,
      total.capTotal - before.daysTotal
    )} days left.`;
  }
  // A booking across an anniversary counts each part against its own year.
  for (let year = firstYear; year.start <= request.endDate; year = uplYearContaining(new Date(year.end.getTime() + 86_400_000), entitledFrom)) {
    const used = uplUsage({ ...input, bookings: all, year });
    if (used.daysThisYear > used.capThisYear) {
      const before = uplUsage({ ...input, year });
      const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
      return `That's more than ${UPL_WEEKS_PER_CHILD_PER_YEAR} weeks (${used.capThisYear} working days) of unpaid parental leave for ${childName} in the year ${f(year.start)} – ${f(year.end)}. ${Math.max(
        0,
        used.capThisYear - before.daysThisYear
      )} days left that year.`;
    }
  }
  return null;
}

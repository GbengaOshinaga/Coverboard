import { countWorkingDays } from "@/lib/working-week";

/**
 * Unpaid parental leave (https://www.gov.uk/parental-leave): up to 18 weeks
 * for each child before their 18th birthday, and at most 4 weeks for each
 * child in a year. A week is the person's normal working week, so days are
 * counted on the days they work.
 */
export const UPL_WEEKS_PER_CHILD = 18;
export const UPL_WEEKS_PER_CHILD_PER_YEAR = 4;

type Range = { startDate: Date; endDate: Date };

export function eighteenthBirthday(dateOfBirth: Date): Date {
  return new Date(
    Date.UTC(dateOfBirth.getUTCFullYear() + 18, dateOfBirth.getUTCMonth(), dateOfBirth.getUTCDate())
  );
}

export type UplUsage = {
  /** Working days used for this child in the request's calendar year. */
  daysThisYear: number;
  /** Working days used for this child in total, including other employers. */
  daysTotal: number;
  capThisYear: number;
  capTotal: number;
};

export function uplUsage(input: {
  /** Live (pending or approved) bookings for this child. */
  bookings: Range[];
  year: number;
  weeksTakenElsewhere: number;
  daysPerWeek: number;
  weekdays: number[] | null;
}): UplUsage {
  const yearStart = new Date(Date.UTC(input.year, 0, 1));
  const yearEnd = new Date(Date.UTC(input.year, 11, 31));
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
 * message, or null when it's within the limits. Bookings that cross into a
 * new year count each part against its own year.
 */
export function uplError(input: {
  childName: string;
  dateOfBirth: Date;
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

  const all = [...input.bookings, request];
  const total = uplUsage({ ...input, bookings: all, year: request.startDate.getUTCFullYear() });
  if (total.daysTotal > total.capTotal) {
    const before = uplUsage({ ...input, year: request.startDate.getUTCFullYear() });
    return `That's more than the ${UPL_WEEKS_PER_CHILD} weeks (${total.capTotal} working days) of unpaid parental leave for ${childName}. ${Math.max(
      0,
      total.capTotal - before.daysTotal
    )} days left.`;
  }
  for (let year = request.startDate.getUTCFullYear(); year <= request.endDate.getUTCFullYear(); year++) {
    const used = uplUsage({ ...input, bookings: all, year });
    if (used.daysThisYear > used.capThisYear) {
      const before = uplUsage({ ...input, year });
      return `That's more than ${UPL_WEEKS_PER_CHILD_PER_YEAR} weeks (${used.capThisYear} working days) of unpaid parental leave for ${childName} in ${year}. ${Math.max(
        0,
        used.capThisYear - before.daysThisYear
      )} days left that year.`;
    }
  }
  return null;
}

import { countWorkingDays } from "@/lib/working-week";

/**
 * Unpaid parental leave (https://www.gov.uk/parental-leave): up to 18 weeks
 * for each child before their 18th birthday, and at most 4 weeks for each
 * child in a year. A week is the person's normal working week, so days are
 * counted on the days they work.
 *
 * The "year" is the child's own, not the calendar or leave year: 12 months
 * from when the employee first became entitled for that child, then each
 * anniversary (the default scheme, Maternity and Parental Leave etc.
 * Regulations 1999, Schedule 2 paras 8–9). Leave is taken in whole weeks
 * unless the child gets a disability benefit (para 7).
 * https://www.legislation.gov.uk/uksi/1999/3312/schedule/2
 *
 * The app always applies the default scheme; a workforce or collective
 * agreement can replace it, and isn't modelled.
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
 * The year's service needed for this leave went on 6 April 2026 (Employment
 * Rights Act 2025; reg 13(1) as amended). From then it's a day-one right.
 */
export const UPL_DAY_ONE_FROM = new Date(Date.UTC(2026, 3, 6));

const latest = (...ds: Date[]) => new Date(Math.max(...ds.map((x) => x.getTime())));

/**
 * When the employee first became entitled for this child. Responsibility
 * starts at birth, or at placement for an adopted child. Under the old rule
 * they also needed a year's service; if that made them entitled before
 * 6 April 2026, that date stands. Otherwise it's the latest of
 * responsibility, their start date and 6 April 2026. Responsibility alone
 * when the start date isn't recorded.
 */
export function uplEntitledFrom(
  child: { dateOfBirth: Date; placedOn?: Date | null },
  serviceStartDate: Date | null
): Date {
  const responsible = child.placedOn ?? child.dateOfBirth;
  if (!serviceStartDate) return latest(responsible);
  const oldRule = latest(responsible, addYears(serviceStartDate, 1));
  if (oldRule < UPL_DAY_ONE_FROM) return oldRule;
  return latest(responsible, serviceStartDate, UPL_DAY_ONE_FROM);
}

export const DISABILITY_BENEFITS =
  "Disability Living Allowance, Personal Independence Payment or Armed Forces Independence Payment";

/**
 * Whole weeks (para 7): the working days booked must be a multiple of their
 * working week. Only checked when we know which days they work: a work
 * pattern, or 5 days with none (counted Mon–Fri). A part-timer with only a
 * day count could work any of the days, so a booking can't be judged.
 *
 * Nor can it when hours vary (zero-hours or variable-hours with no pattern):
 * their week is a year's working time averaged over 52 weeks (reg 14(3)),
 * which the app doesn't hold, so the 5 days assumed for them mustn't force
 * Mon–Fri blocks.
 */
export function uplWholeWeeksError(input: {
  request: Range;
  daysPerWeek: number;
  weekdays: number[] | null;
  /** Zero-hours or variable-hours: no fixed week. */
  irregularHours?: boolean;
}): string | null {
  const { daysPerWeek } = input;
  if (!uplWholeWeeksChecked(input)) return null;
  const days = countWorkingDays(input.request.startDate, input.request.endDate, input.weekdays);
  if (days > 0 && days % daysPerWeek === 0) return null;
  const week = daysPerWeek === 1 ? "1 working day" : `${daysPerWeek} working days`;
  return `Unpaid parental leave has to be taken in whole weeks. A week here is ${week}, and this booking is ${days}. Single days are only allowed when the child gets ${DISABILITY_BENEFITS} – tick that on the child if so.`;
}

/** Whether whole weeks can be checked for this working week (see uplWholeWeeksError). */
export function uplWholeWeeksChecked(input: {
  daysPerWeek: number;
  weekdays: number[] | null;
  irregularHours?: boolean;
}): boolean {
  return !!input.weekdays || (input.daysPerWeek === 5 && !input.irregularHours);
}

/** Zero-hours, variable-hours, or no days a week recorded: no fixed week. */
export function hasIrregularHours(person: { employmentType: string | null; daysWorkedPerWeek: number | null } | null): boolean {
  return (
    person?.employmentType === "ZERO_HOURS" ||
    person?.employmentType === "VARIABLE_HOURS" ||
    !((person?.daysWorkedPerWeek ?? 0) >= 1)
  );
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
  /** Adopted: placement date. */
  placedOn?: Date | null;
  /** Gets DLA, PIP or AFIP: days allowed, not only whole weeks. */
  disabilityBenefit?: boolean;
  /** Employment start, for when entitlement began (null if not recorded). */
  serviceStartDate: Date | null;
  request: Range;
  /** The child's other live bookings (not this one). */
  bookings: Range[];
  weeksTakenElsewhere: number;
  daysPerWeek: number;
  weekdays: number[] | null;
  irregularHours?: boolean;
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
  if (input.placedOn && request.startDate < input.placedOn) {
    return `Unpaid parental leave for ${childName} can't start before they were placed with you.`;
  }
  // Nothing to count (e.g. a weekend, counted Mon–Fri with no pattern) would
  // never use up the allowance.
  if (countWorkingDays(request.startDate, request.endDate, input.weekdays) === 0) {
    return input.weekdays
      ? `This booking has none of the days worked in it, so it wouldn't count against the unpaid parental leave for ${childName}.`
      : `This booking has no weekdays in it. Without a working pattern, days are counted Monday to Friday – add a working pattern to book the days actually worked.`;
  }
  if (!input.disabilityBenefit) {
    const wholeWeeks = uplWholeWeeksError(input);
    if (wholeWeeks) return wholeWeeks;
  }

  const entitledFrom = uplEntitledFrom(input, input.serviceStartDate);
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

/**
 * Rechecks the leave already booked for a child after its details change
 * (dates, weeks taken elsewhere, disability benefit). Each booking goes
 * through the same check as booking it now (uplError), with the working week
 * on its own start date, which is what was used when it was booked, and the
 * others counted alongside it. Null when they all still fit.
 */
export function uplBookedLeaveError(input: {
  childName: string;
  dateOfBirth: Date;
  placedOn?: Date | null;
  disabilityBenefit: boolean;
  serviceStartDate: Date | null;
  weeksTakenElsewhere: number;
  irregularHours?: boolean;
  /** Live bookings, each with the working week on its start date. */
  bookings: (Range & { daysPerWeek: number; weekdays: number[] | null })[];
}): string | null {
  const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  for (const b of input.bookings) {
    const error = uplError({
      ...input,
      request: { startDate: b.startDate, endDate: b.endDate },
      bookings: input.bookings.filter((o) => o !== b).map(({ startDate, endDate }) => ({ startDate, endDate })),
      daysPerWeek: b.daysPerWeek,
      weekdays: b.weekdays,
    });
    if (error) return `With this change, the leave booked for ${f(b.startDate)} – ${f(b.endDate)} wouldn't be allowed. ${error}`;
  }
  return null;
}

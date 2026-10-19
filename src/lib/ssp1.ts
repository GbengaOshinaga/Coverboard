/**
 * Form SSP1, defined once: employers must give it to an employee who can't
 * get Statutory Sick Pay, or whose SSP is ending while they're still sick, so
 * they can claim benefits instead. Every mention in the app comes from here.
 *
 * The form (dated 10/26 since 12 October 2026) and when to give it:
 * https://www.gov.uk/government/publications/statutory-sick-pay-employee-not-entitled-form-for-employers
 * https://www.gov.uk/employers-sick-pay/eligibility-and-form-ssp1
 *   - can't get SSP: within 7 days of their first day off sick
 *   - SSP ends unexpectedly while still sick: within 7 days of it ending
 *   - SSP expected to end before their sickness does: on or before the
 *     beginning of the 23rd week
 */

import { SSP_REFORM_DATE } from "@/lib/uk-compliance";

const DAY_MS = 86_400_000;

/** GOV.UK's page for the form; links there, not to the PDF, whose address changes with each version. */
export const SSP1_FORM_URL =
  "https://www.gov.uk/government/publications/statutory-sick-pay-employee-not-entitled-form-for-employers";
/** The version current when this was written (the date printed on the form). */
export const SSP1_FORM_VERSION = "10/26";

/** The form's own wording for the boxes the app can tell apply. */
export const SSP1_REASON = {
  noEarnings: "Your earnings in the 8 weeks before your sickness absence began were £0.",
  contractEnded: "Your contract of employment has ended or will be coming to an end.",
  sspEnding: "You will soon have been getting SSP for 28 weeks in a row.",
} as const;

/** SSP ends at 28 weeks; the form is due by the start of the 23rd. */
export const SSP1_WARN_FROM_WEEK = 22;
const SSP1_DUE_BY_WEEK = 23;

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** Not entitled to SSP: within 7 days of the first day off sick. */
export function ssp1DueWhenNotEntitled(firstDayOff: Date): Date {
  return addDays(firstDayOff, 7);
}

/** SSP ended while they're still sick (a leaver, or the limit reached unexpectedly): within 7 days. */
export function ssp1DueAfterSspEnds(lastDayOfSsp: Date): Date {
  return addDays(lastDayOfSsp, 7);
}

/**
 * When SSP runs out if they stay off sick, working on the days they normally
 * work: the 28-week limit is 28 × their working days a week, and SSP days
 * already paid in the linked period count. `payable(day)` says whether a day
 * of this absence is an SSP day (a day they work, not a waiting day).
 *
 * Returns the last day SSP is paid, when week 22 of SSP starts (when to warn)
 * and when week 23 starts (the form is due by then), or null if SSP doesn't
 * run out within `horizonDays` of the absence starting. `payable` is called
 * once for each day, in date order.
 */
export function sspRunsOut(input: {
  startDate: Date;
  daysPerWeek: number;
  /** SSP days already paid in earlier linked absences. */
  priorDaysPaid: number;
  payable: (day: Date) => boolean;
  horizonDays?: number;
}): { lastDay: Date; week22StartsOn: Date; week23StartsOn: Date } | null {
  const perWeek = input.daysPerWeek;
  const max = 28 * perWeek;
  const week22At = (SSP1_WARN_FROM_WEEK - 1) * perWeek;
  const week23At = (SSP1_DUE_BY_WEEK - 1) * perWeek;
  let paid = input.priorDaysPaid;
  let week22StartsOn: Date | null = paid >= week22At ? input.startDate : null;
  let week23StartsOn: Date | null = paid >= week23At ? input.startDate : null;
  if (paid >= max) return { lastDay: addDays(input.startDate, -1), week22StartsOn: input.startDate, week23StartsOn: input.startDate };
  const horizon = input.horizonDays ?? 3 * 366;
  for (let i = 0; i < horizon; i++) {
    const day = addDays(input.startDate, i);
    if (!input.payable(day)) continue;
    if (week22StartsOn === null && paid >= week22At) week22StartsOn = day;
    if (week23StartsOn === null && paid >= week23At) week23StartsOn = day;
    paid += 1;
    if (paid >= max) return { lastDay: day, week22StartsOn: week22StartsOn ?? day, week23StartsOn: week23StartsOn ?? day };
  }
  return null;
}

export type Ssp1Due = {
  kind: "noEarnings" | "sspEnding" | "contractEnded";
  /** The box to tick on the form, in its own words. */
  reason: string;
  /** YYYY-MM-DD: the form is due by this date. */
  dueBy: string;
  /** YYYY-MM-DD: the last day SSP is paid (SSP ending, or a leaver's last day). */
  sspEndsOn?: string;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * No SSP because earnings in the 8 weeks before were £0 (from 6 April 2026;
 * an average of 0 means every week was recorded as no pay). Null otherwise.
 */
export function ssp1ForNoEarnings(input: { startDate: Date; averageWeeklyEarnings: number | null }): Ssp1Due | null {
  if (input.startDate < SSP_REFORM_DATE || input.averageWeeklyEarnings === null || input.averageWeeklyEarnings !== 0) {
    return null;
  }
  return { kind: "noEarnings", reason: SSP1_REASON.noEarnings, dueBy: ymd(ssp1DueWhenNotEntitled(input.startDate)) };
}

/**
 * SSP running out while they're off: once they're in week 22 of SSP, or as
 * soon as the absence booked runs past the day SSP ends. The form is due by
 * the start of week 23. Null when neither applies or SSP ended over a week ago.
 */
export function ssp1ForSspEnding(input: {
  runsOut: { lastDay: Date; week22StartsOn: Date; week23StartsOn: Date } | null;
  absenceEnd: Date;
  today: Date;
}): Ssp1Due | null {
  const r = input.runsOut;
  if (!r) return null;
  if (input.today > ssp1DueAfterSspEnds(r.lastDay)) return null;
  if (input.today < r.week22StartsOn && r.lastDay >= input.absenceEnd) return null;
  return { kind: "sspEnding", reason: SSP1_REASON.sspEnding, dueBy: ymd(r.week23StartsOn), sspEndsOn: ymd(r.lastDay) };
}

/** A leaver still off sick at their last day: SSP stops then; the form is due within 7 days. */
export function ssp1ForLeaver(lastDay: Date): Ssp1Due {
  return {
    kind: "contractEnded",
    reason: SSP1_REASON.contractEnded,
    dueBy: ymd(ssp1DueAfterSspEnds(lastDay)),
    sspEndsOn: ymd(lastDay),
  };
}

const ukDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" });

/**
 * What to do, in a sentence, for the report, its CSV and the leaving dialog.
 * Pass `today: null` for a record (the CSV) that always states the due date.
 */
export function ssp1Summary(due: Ssp1Due, today: Date | null = new Date()): string {
  const late = today !== null && ymd(today) > due.dueBy;
  const by = late ? `now (it was due by ${ukDate(due.dueBy)})` : `by ${ukDate(due.dueBy)}`;
  switch (due.kind) {
    case "noEarnings":
      return `No SSP: earnings were £0 in the 8 weeks before. Give them form SSP1 ${by}.`;
    case "sspEnding":
      return `SSP runs out on ${ukDate(due.sspEndsOn!)}. If they won't be back by then, give them form SSP1 ${by}${late ? "" : ", the start of week 23"}.`;
    case "contractEnded":
      return `SSP stops on their last day, ${ukDate(due.sspEndsOn!)}, if they're still off sick. Give them form SSP1 ${by}.`;
  }
}

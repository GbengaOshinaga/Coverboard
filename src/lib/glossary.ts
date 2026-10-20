/**
 * Plain-English meanings for the terms the app can't avoid, defined once:
 * the "?" next to a term (TermHint), the explanation under a chosen leave
 * type, and the glossary on the Help page all read from here. Rates aren't
 * repeated here; they live with the rules (uk-compliance.ts, smpCalculator.ts).
 */

export type GlossaryEntry = {
  term: string;
  /** One or two short sentences, no jargon. */
  meaning: string;
  /** GOV.UK or ICO page for the detail. */
  link?: string;
};

export const GLOSSARY = {
  ssp: {
    term: "SSP (Statutory Sick Pay)",
    meaning:
      "The minimum sick pay employers must pay, from the first day off sick, for up to 28 weeks. It's the lower of a flat weekly rate and 80% of what they earned on average in the 8 weeks before.",
    link: "https://www.gov.uk/statutory-sick-pay",
  },
  qualifyingDays: {
    term: "Qualifying days",
    meaning: "The days someone normally works. SSP is only paid for these days.",
    link: "https://www.gov.uk/employers-sick-pay",
  },
  smp: {
    term: "SMP (Statutory Maternity Pay)",
    meaning:
      "Pay for up to 39 weeks of maternity leave: 90% of average weekly earnings for the first 6 weeks, then a flat weekly rate (or 90%, if that's lower). SAP is the same for adoption.",
    link: "https://www.gov.uk/maternity-pay-leave",
  },
  spl: {
    term: "SPL (Shared parental leave)",
    meaning:
      "Lets parents share up to 50 weeks of leave after a birth or adoption, once the mother or main adopter ends their maternity or adoption leave early.",
    link: "https://www.gov.uk/shared-parental-leave-and-pay",
  },
  shpp: {
    term: "ShPP (Statutory Shared Parental Pay)",
    meaning: "Pay for up to 37 weeks of shared parental leave, at the same flat weekly rate as SMP (or 90% of earnings, if lower).",
    link: "https://www.gov.uk/shared-parental-leave-and-pay",
  },
  kit: {
    term: "KIT and SPLIT days",
    meaning:
      "Keeping in touch days: up to 10 days someone on maternity or adoption leave can work without ending their leave. SPLIT days are the same for shared parental leave, up to 20.",
    link: "https://www.gov.uk/employee-rights-when-on-leave",
  },
  fte: {
    term: "FTE (full-time equivalent)",
    meaning:
      "How much of a full-time week someone works: 1 is full time, 0.6 is 3 days of a 5-day week. Part-time holiday is worked out from it.",
  },
  bradford: {
    term: "Bradford score",
    meaning:
      "A way of spotting frequent short absences: the number of sickness spells, squared, times the days off, over the last 12 months. Six 1-day absences score 216; one 6-day absence scores 6. A high score is a prompt for a conversation, not a rule.",
  },
  sar: {
    term: "SAR (subject access request)",
    meaning:
      "Anyone can ask for a copy of the personal data you hold about them, and you usually have one month to reply. The export gives you theirs.",
    link: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/",
  },
  coverByLocation: {
    term: "Cover by location",
    meaning:
      "Whether each location or unit, and each shift if you use them, still has the minimum number of staff you've set once leave and sickness are taken off.",
  },
  optOut48: {
    term: "48-hour week opt-out",
    meaning:
      "By law, workers can't average more than 48 hours a week (usually over 17 weeks) unless they agree in writing to opt out. They can cancel it by giving notice: 7 days, or up to 3 months if agreed.",
    link: "https://www.gov.uk/maximum-weekly-working-hours",
  },
  rightToWork: {
    term: "Right to work",
    meaning:
      "Employers must check that someone is allowed to work in the UK before they start, and check again before time-limited permission ends. Without a correct check you can be fined.",
    link: "https://www.gov.uk/check-job-applicant-right-to-work",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The glossary entry that explains a leave type, shown under it when it's chosen. */
export function glossaryForLeaveType(name: string): GlossaryEntry | null {
  if (/SSP|sick/i.test(name)) return GLOSSARY.ssp;
  if (/shared parental/i.test(name)) return GLOSSARY.spl;
  if (/maternity|adoption/i.test(name)) return GLOSSARY.smp;
  return null;
}

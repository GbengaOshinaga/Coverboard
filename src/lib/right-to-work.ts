/**
 * Right to work, defined once. A check is recorded with its date (the Home
 * Office requires the date and copies of the documents); time-limited
 * permission has to be checked again before it expires.
 * https://www.gov.uk/check-job-applicant-right-to-work
 * https://www.gov.uk/government/publications/right-to-work-checks-employers-guide
 *
 * The person's record holds their latest check (verified, checked on, expires
 * on), kept in step whenever a check is recorded, so every screen, report and
 * email reads the same status from here.
 */

export type RightToWorkMethod = "ONLINE_SHARE_CODE" | "MANUAL_DOCUMENTS" | "IDENTITY_SERVICE_PROVIDER";

export const RIGHT_TO_WORK_METHOD_LABEL: Record<RightToWorkMethod, string> = {
  ONLINE_SHARE_CODE: "Online check (share code)",
  MANUAL_DOCUMENTS: "Original documents",
  IDENTITY_SERVICE_PROVIDER: "Identity service provider (British or Irish)",
};

/** Rechecks coming up within this many days are flagged. */
export const RECHECK_WARNING_DAYS = 60;

export type RightToWorkStatus =
  /** No check recorded. */
  | "not_checked"
  /** A check found they don't have the right to work. */
  | "not_verified"
  /** Time-limited permission has run out: recheck now. */
  | "expired"
  /** Time-limited permission ends within 60 days. */
  | "recheck_due"
  | "checked";

const DAY_MS = 86_400_000;
const dayOnly = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function rightToWorkStatus(
  person: { verified: boolean | null; expiresOn: Date | null },
  today: Date = new Date()
): RightToWorkStatus {
  if (person.verified === null) return "not_checked";
  if (person.verified === false) return "not_verified";
  if (person.expiresOn) {
    const daysLeft = (dayOnly(person.expiresOn) - dayOnly(today)) / DAY_MS;
    if (daysLeft < 0) return "expired";
    if (daysLeft <= RECHECK_WARNING_DAYS) return "recheck_due";
  }
  return "checked";
}

/** No valid right to work on record: not checked, failed, or expired. */
export function rightToWorkAtRisk(status: RightToWorkStatus): boolean {
  return status === "not_checked" || status === "not_verified" || status === "expired";
}

const fmt = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function rightToWorkLabel(
  status: RightToWorkStatus,
  person: { expiresOn: Date | null; checkedOn: Date | null }
): string {
  switch (status) {
    case "not_checked":
      return "Not checked";
    case "not_verified":
      return "No right to work found";
    case "expired":
      return `Permission expired ${fmt(person.expiresOn!)}: recheck now`;
    case "recheck_due":
      return `Recheck before ${fmt(person.expiresOn!)}`;
    case "checked":
      return person.expiresOn
        ? `Checked, permission until ${fmt(person.expiresOn)}`
        : person.checkedOn
          ? `Checked ${fmt(person.checkedOn)}, no time limit`
          : "Checked";
  }
}

/**
 * Prisma filters for people with no valid right to work on record (not
 * checked, failed, or expired), and for rechecks coming due.
 */
export function rightToWorkAtRiskWhere(today: Date = new Date()) {
  return {
    OR: [
      { rightToWorkVerified: null },
      { rightToWorkVerified: false },
      { rightToWorkVerified: true, rightToWorkExpiresOn: { lt: new Date(dayOnly(today)) } },
    ],
  };
}

export function rightToWorkRecheckDueWhere(today: Date = new Date()) {
  const from = new Date(dayOnly(today));
  return {
    rightToWorkVerified: true,
    rightToWorkExpiresOn: { gte: from, lte: new Date(from.getTime() + RECHECK_WARNING_DAYS * DAY_MS) },
  };
}

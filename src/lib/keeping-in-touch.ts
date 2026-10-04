/**
 * Days someone can work during family leave without ending it or losing pay:
 * up to 10 "keeping in touch" (KIT) days on maternity or adoption leave, and
 * up to 20 "shared parental leave in touch" (SPLIT) days on shared parental
 * leave. Paternity and other leave have none.
 * https://www.gov.uk/employers-maternity-pay-leave/leave
 * https://www.gov.uk/shared-parental-leave-and-pay/employer-guidance
 */

export type KeepingInTouchRule = {
  kind: "KIT" | "SPLIT";
  /** The LeaveRequest column the days are stored in. */
  field: "kitDaysUsed" | "splitDaysUsed";
  allowed: number;
};

export const KIT_DAYS_ALLOWED = 10;
export const SPLIT_DAYS_ALLOWED = 20;

export function keepingInTouchRule(leaveTypeName: string): KeepingInTouchRule | null {
  if (/shared parental|\bSPL\b/i.test(leaveTypeName)) {
    return { kind: "SPLIT", field: "splitDaysUsed", allowed: SPLIT_DAYS_ALLOWED };
  }
  if (/maternity|adoption/i.test(leaveTypeName)) {
    return { kind: "KIT", field: "kitDaysUsed", allowed: KIT_DAYS_ALLOWED };
  }
  return null;
}

/**
 * Checks KIT/SPLIT days being saved on a leave request. Returns an error
 * message, or null when the update is allowed.
 */
export function keepingInTouchError(
  leaveTypeName: string,
  update: { kitDaysUsed?: number; splitDaysUsed?: number }
): string | null {
  const rule = keepingInTouchRule(leaveTypeName);
  const other = rule?.field === "kitDaysUsed" ? "splitDaysUsed" : "kitDaysUsed";
  if (!rule) {
    if ((update.kitDaysUsed ?? 0) > 0 || (update.splitDaysUsed ?? 0) > 0) {
      return `${leaveTypeName} has no KIT or SPLIT days.`;
    }
    return null;
  }
  if ((update[other] ?? 0) > 0) {
    return rule.kind === "KIT"
      ? `${leaveTypeName} uses KIT days, not SPLIT days.`
      : `${leaveTypeName} uses SPLIT days, not KIT days.`;
  }
  const days = update[rule.field];
  if (days !== undefined && days > rule.allowed) {
    return `Up to ${rule.allowed} ${rule.kind} days are allowed on ${leaveTypeName}.`;
  }
  return null;
}

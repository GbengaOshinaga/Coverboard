import { SSP_MAX_WEEKS } from "@/lib/uk-compliance";

/**
 * How a leave type's allowance reads on screen. SSP has no day allowance (it's
 * paid per absence for up to 28 weeks), statutory family leave is set in
 * weeks, and everything else is days.
 */
export function allowanceLabel(lt: {
  name: string;
  defaultDays: number;
  allowanceUnit?: "DAYS" | "WEEKS" | null;
}): string {
  if (/SSP/i.test(lt.name)) return `Up to ${SSP_MAX_WEEKS} weeks per absence`;
  if (lt.defaultDays === 0 && /sick/i.test(lt.name)) return "Tracked per absence";
  const n = lt.defaultDays;
  if (lt.allowanceUnit === "WEEKS") return `${n} ${n === 1 ? "week" : "weeks"}`;
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/**
 * The leave-type list people pick from, defined once: everyday leave first,
 * in the order it's most often used, then family leave as its own group. All
 * types stay listed (staff do need to request family leave), but a carer
 * ringing in sick shouldn't scroll past adoption leave to find it.
 */
const FAMILY_LEAVE = /maternity|paternity|adoption|shared parental|neonatal|bereavement|unpaid parental/i;
/** Given per birth, adoption or loss, not a yearly balance. */
const PER_EVENT_LEAVE = /maternity|paternity|adoption|shared parental|neonatal|bereavement/i;
const EVERYDAY_ORDER: RegExp[] = [/annual/i, /SSP|sick/i, /^unpaid leave$/i, /carer/i];

export function leaveTypeGroup(name: string): "Everyday" | "Family leave" {
  return FAMILY_LEAVE.test(name) ? "Family leave" : "Everyday";
}

/** Sorts leave types for the list: everyday (annual, sickness, unpaid, carer's, then the rest), then family leave; by name within each. */
export function compareLeaveTypesForList(a: { name: string }, b: { name: string }): number {
  const rank = (n: string) => {
    if (FAMILY_LEAVE.test(n)) return 100;
    const i = EVERYDAY_ORDER.findIndex((re) => re.test(n));
    return i === -1 ? EVERYDAY_ORDER.length : i;
  };
  return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
}

/** Plain name for the list; the stored name (which rules match on) is unchanged. */
export function leaveTypeListName(name: string): string {
  if (/^Statutory Sick Pay \(SSP\)$/i.test(name)) return "Sickness (SSP)";
  return name;
}

/**
 * What to show next to a type in the list: what's left of a yearly balance,
 * or for leave given per birth, adoption or loss, what can be taken ("up to
 * 52 weeks"), since "260 days left" reads like a balance being used up.
 * Nothing for types with no allowance (sickness, unpaid leave).
 */
export function leaveTypeListHint(
  lt: { name: string; defaultDays: number; allowanceUnit?: "DAYS" | "WEEKS" | null },
  balance: { allowance: number; remaining: number; unit?: string } | null
): string | null {
  if (/neonatal/i.test(lt.name)) return null; // depends on the time in care; shown under the dates
  if (PER_EVENT_LEAVE.test(lt.name)) return lt.defaultDays > 0 ? `up to ${allowanceLabel(lt)}` : null;
  if (!balance || balance.allowance <= 0) return null;
  return balance.unit === "hours" ? `${balance.remaining.toFixed(1)} hrs left` : `${balance.remaining} days left`;
}

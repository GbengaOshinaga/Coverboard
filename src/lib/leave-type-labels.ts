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

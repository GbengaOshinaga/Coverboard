import { isSicknessLeaveTypeName } from "@/lib/leave-requests/rules";

/**
 * Which absences get Statutory Sick Pay, defined once. SSP is a UK employer's
 * duty for any sickness absence, whatever the team calls the leave type: a
 * "Sick Leave" booking (often company sick pay) still has SSP within it, and
 * SSP used to be skipped unless the "Statutory Sick Pay (SSP)" type was chosen.
 * https://www.gov.uk/employers-sick-pay
 */
export function isSspAbsence(leaveTypeName: string, workCountry: string | null | undefined): boolean {
  return isSicknessLeaveTypeName(leaveTypeName) && sspAppliesTo(workCountry);
}

/** SSP is a UK employer's duty: only for people whose work country is the UK. */
export function sspAppliesTo(workCountry: string | null | undefined): boolean {
  return workCountry === "GB";
}

/**
 * Prisma filter for sickness leave types, matching isSicknessLeaveTypeName
 * (/SSP|Sick/i). Use as `leaveType: SICKNESS_LEAVE_TYPE`.
 */
export const SICKNESS_LEAVE_TYPE = {
  OR: [
    { name: { contains: "SSP", mode: "insensitive" as const } },
    { name: { contains: "sick", mode: "insensitive" as const } },
  ],
};

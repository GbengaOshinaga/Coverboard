import { prisma } from "@/lib/prisma";

/**
 * UK holiday pay rate calculator.
 *
 * Since the 2020 amendments to the Working Time Regulations 1998 (and the
 * Harpur Trust v Brazel line of cases), employers must pay "normal
 * remuneration" for statutory holiday — not basic salary alone. Normal pay
 * includes regular overtime, commission, and shift allowances, averaged over
 * the **last 52 paid weeks**. Weeks in which the worker received no pay are
 * excluded from the average; the employer must look back further (capped at
 * 104 weeks in practice, but we accept whatever history is supplied).
 *
 * @see https://www.legislation.gov.uk/uksi/1998/1833/regulation/16
 */

/**
 * Input row for {@link calculateHolidayPayRate}.
 *
 * `gross_earnings` must already include basic pay + regular overtime +
 * commission + shift allowances for the week. `is_zero_pay_week` is how
 * callers flag weeks that must be excluded from the 52-week average.
 */
export type WeeklyEarning = {
  week_start_date: Date | string;
  gross_earnings: number;
  hours_worked?: number;
  is_zero_pay_week: boolean;
};

function isUkWorkCountry(workCountry: string | null | undefined): boolean {
  return workCountry === "GB";
}

/**
 * Working days per week used to convert a weekly average into a daily rate.
 *
 * Hard-coded to 5 per the task specification. Callers with part-time workers
 * should either pass a pre-scaled weekly figure or compute the daily rate
 * themselves using {@link calculateWeeklyHolidayPayRate}.
 */
const WORKING_DAYS_PER_WEEK = 5;

/**
 * Return the employee's average **daily** holiday pay rate (£) based on the
 * most recent 52 paid weeks.
 *
 * - Zero-pay weeks are excluded per the Working Time Regulations as amended.
 * - If more than 52 paid weeks are supplied, only the most recent 52 are
 *   used. The function assumes `weeklyEarnings` is roughly chronological;
 *   it uses `.slice(-52)` so callers should pass oldest → newest.
 * - Returns `0` when no paid weeks are available (the caller is expected to
 *   fall back to basic salary and surface a warning).
 */
export function calculateHolidayPayRate(
  weeklyEarnings: WeeklyEarning[]
): number {
  const paidWeeks = weeklyEarnings
    .filter((w) => !w.is_zero_pay_week)
    .slice(-52);

  if (paidWeeks.length === 0) return 0;

  const totalEarnings = paidWeeks.reduce(
    (sum, w) => sum + Number(w.gross_earnings),
    0
  );

  return Number(
    (totalEarnings / paidWeeks.length / WORKING_DAYS_PER_WEEK).toFixed(2)
  );
}

/**
 * UK-only holiday pay wrapper:
 * - returns `null` when holiday pay earnings history does not apply
 *   (non-UK work location)
 * - otherwise returns the computed daily rate.
 */
export async function calculateHolidayPayRateForEmployee(
  employeeId: string,
  weeklyEarnings: WeeklyEarning[]
): Promise<number | null> {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { workCountry: true },
  });
  if (!employee || !isUkWorkCountry(employee.workCountry)) {
    return null;
  }
  return calculateHolidayPayRate(weeklyEarnings);
}

/**
 * Same logic as {@link calculateHolidayPayRate} but returns the weekly
 * average rather than the per-day figure. Useful when converting for a
 * custom working-pattern.
 */
export function calculateWeeklyHolidayPayRate(
  weeklyEarnings: WeeklyEarning[]
): number {
  const paidWeeks = weeklyEarnings
    .filter((w) => !w.is_zero_pay_week)
    .slice(-52);
  if (paidWeeks.length === 0) return 0;
  const total = paidWeeks.reduce((sum, w) => sum + Number(w.gross_earnings), 0);
  return Number((total / paidWeeks.length).toFixed(2));
}

/**
 * Fetch a user's 52-week earnings history (oldest → newest) and compute the
 * daily holiday pay rate. Returns `null` if the user has no earnings rows —
 * callers should treat `null` as "fall back to basic salary".
 *
 * Prisma `Decimal` values are coerced to `number` here; we keep two decimal
 * places via {@link calculateHolidayPayRate}'s `toFixed(2)`.
 */
export async function getDailyHolidayPayRateForUser(
  userId: string
): Promise<number | null> {
  const employee = await prisma.user.findUnique({
    where: { id: userId },
    select: { workCountry: true },
  });
  if (!employee || !isUkWorkCountry(employee.workCountry)) return null;

  const rows = await prisma.weeklyEarning.findMany({
    where: { userId },
    orderBy: { weekStartDate: "asc" },
    take: 260,
  });

  if (rows.length === 0) return null;

  const weeks: WeeklyEarning[] = rows.map((r) => ({
    week_start_date: r.weekStartDate,
    gross_earnings: Number(r.grossEarnings),
    hours_worked: Number(r.hoursWorked),
    is_zero_pay_week: r.isZeroPayWeek,
  }));

  return calculateHolidayPayRate(weeks);
}

/**
 * Returns `true` when the provided leave-type name refers to annual leave
 * and should therefore trigger a holiday pay calculation.
 *
 * We deliberately keep this permissive: UK compliance seeds "Annual Leave",
 * but an organization may rename it — so we match on any leave type whose
 * name contains "annual" (case-insensitive).
 */
export function isAnnualLeaveType(leaveTypeName: string | null | undefined): boolean {
  if (!leaveTypeName) return false;
  return /\bannual\b/i.test(leaveTypeName);
}

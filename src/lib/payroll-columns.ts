import type { ExportColumn } from "@/lib/export-formats";
import type { SMPPhase } from "@/lib/smpCalculator";

/**
 * The payroll export, defined once. The API builds rows of this shape and
 * serialises them with these columns for CSV and Excel; the Reports page reads
 * the same rows as JSON and downloads the file from the API. Add a column
 * here and every format gets it.
 */

export type PayrollRateSource = "captured_at_booking" | "recalculated" | "not_applicable";

export type PayrollRow = {
  leaveRequestId: string;
  userId: string;
  name: string;
  email: string;
  department: string | null;
  /** The country whose rules apply to their pay (workCountry). */
  workCountry: string | null;
  employmentType: string;
  leaveType: string;
  leaveCategory: string;
  isPaid: boolean;
  /** ISO timestamps. */
  startDate: string;
  endDate: string;
  daysTaken: number;
  hoursTaken: number | null;
  hourlyRate: number | null;
  /** Holiday pay fields: present for UK-based staff only. */
  dailyHolidayPayRate?: number | null;
  estimatedPay?: number | null;
  rateSource?: PayrollRateSource;
  smp: {
    phase: SMPPhase;
    label: string;
    weeklyRate: number | null;
    averageWeeklyEarnings: number | null;
    phase1EndDate: string;
    phase2EndDate: string;
    phase1WeeklyRate: number | null;
    phase2WeeklyRate: number | null;
  } | null;
  neonatal: {
    weeklyRate: number | null;
    weeksTaken: number;
    estimatedPay: number | null;
  } | null;
  /**
   * SSP for this absence within the pay period: days on their qualifying
   * days, at the daily rate stored when it was booked (null for absences
   * booked before the rate was stored).
   */
  ssp: {
    daysInPeriod: number;
    dailyRate: number | null;
    pay: number | null;
  } | null;
};

export type PayrollReport = {
  from: string;
  to: string;
  rows: PayrollRow[];
  totals: {
    rowCount: number;
    totalDays: number;
    totalHours: number;
    /** Estimated holiday pay. */
    totalEstimatedPay: number;
    totalSspPay: number;
  };
};

const day = (iso: string) => iso.slice(0, 10);

export const PAYROLL_EXPORT_COLUMNS: ExportColumn<PayrollRow>[] = [
  { key: "leaveRequestId", header: "Leave request ID" },
  { key: "userId", header: "Employee ID" },
  { key: "name", header: "Employee" },
  { key: "email", header: "Email" },
  { key: "department", header: "Department" },
  { key: "workCountry", header: "Work country" },
  { key: "employmentType", header: "Employment type" },
  { key: "leaveType", header: "Leave type" },
  { key: "leaveCategory", header: "Category" },
  { key: (r) => (r.isPaid ? "Yes" : "No"), header: "Paid" },
  { key: (r) => day(r.startDate), header: "Start date" },
  { key: (r) => day(r.endDate), header: "End date" },
  { key: "daysTaken", header: "Days taken" },
  { key: "hoursTaken", header: "Hours taken" },
  { key: (r) => r.dailyHolidayPayRate ?? null, header: "Daily holiday pay rate (£)", format: "money" },
  { key: "hourlyRate", header: "Hourly holiday pay rate (£)", format: "money" },
  { key: (r) => r.estimatedPay ?? null, header: "Estimated holiday pay (£)", format: "money" },
  { key: (r) => r.rateSource ?? null, header: "Rate source" },
  { key: (r) => r.ssp?.daysInPeriod ?? null, header: "SSP days" },
  { key: (r) => r.ssp?.dailyRate ?? null, header: "SSP daily rate (£, 4 d.p. per HMRC tables)", format: "rate" },
  { key: (r) => r.ssp?.pay ?? null, header: "SSP pay (£)", format: "money" },
  { key: (r) => r.smp?.label ?? null, header: "SMP phase" },
  { key: (r) => r.smp?.weeklyRate ?? null, header: "SMP weekly rate (£)", format: "money" },
  { key: (r) => r.smp?.averageWeeklyEarnings ?? null, header: "SMP average weekly earnings (£)", format: "money" },
  { key: (r) => r.neonatal?.weeksTaken ?? null, header: "Neonatal weeks" },
  { key: (r) => r.neonatal?.weeklyRate ?? null, header: "Neonatal weekly rate (£)", format: "money" },
  { key: (r) => r.neonatal?.estimatedPay ?? null, header: "Neonatal estimated pay (£)", format: "money" },
];

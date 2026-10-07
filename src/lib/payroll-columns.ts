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
  /** Days they'd have worked (their working week), within the period. */
  daysTaken: number;
  /** Calendar days within the period (weekly pay like SMP/SPP is per calendar day). */
  calendarDays: number;
  hoursTaken: number | null;
  hourlyRate: number | null;
  /** Holiday pay fields: present for UK-based staff only. */
  dailyHolidayPayRate?: number | null;
  estimatedPay?: number | null;
  rateSource?: PayrollRateSource;
  /**
   * SMP (maternity) or SAP (adoption) for the days of this pay period
   * (src/lib/smp-dates.ts smpPayInPeriod): the same phases and rates.
   */
  smp: {
    kind: "SMP" | "SAP";
    phase: SMPPhase;
    label: string;
    /** The rate for these days (the 90% rate if any fall in the first 6 weeks). */
    weeklyRate: number | null;
    daysInPeriod: number;
    /** null when not eligible. */
    pay: number | null;
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
   * Statutory Paternity Pay within the pay period (paternity leave, UK):
   * weekly rate (null when not eligible or no pay recorded), the calendar
   * days in these dates, pay, and why.
   */
  spp: {
    weeklyRate: number | null;
    calendarDays: number;
    pay: number | null;
    basis: string;
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
    /** Earnings the rate came from; null = no pay recorded (flat rate). */
    averageWeeklyEarnings: number | null;
    /** Why the rate is what it is, in words. */
    basis: string | null;
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
    totalSppPay: number;
    totalSmpPay: number;
    totalSapPay: number;
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
  { key: "daysTaken", header: "Working days taken" },
  { key: "calendarDays", header: "Calendar days" },
  { key: "hoursTaken", header: "Hours taken" },
  { key: (r) => r.dailyHolidayPayRate ?? null, header: "Daily holiday pay rate (£)", format: "money" },
  { key: "hourlyRate", header: "Hourly holiday pay rate (£)", format: "money" },
  { key: (r) => r.estimatedPay ?? null, header: "Estimated holiday pay (£)", format: "money" },
  { key: (r) => r.rateSource ?? null, header: "Rate source" },
  { key: (r) => r.ssp?.daysInPeriod ?? null, header: "SSP days" },
  { key: (r) => r.ssp?.dailyRate ?? null, header: "SSP daily rate (£, 4 d.p. per HMRC tables)", format: "rate" },
  { key: (r) => r.ssp?.pay ?? null, header: "SSP pay (£)", format: "money" },
  { key: (r) => r.ssp?.basis ?? null, header: "SSP rate basis" },
  { key: (r) => r.spp?.weeklyRate ?? null, header: "SPP weekly rate (£)", format: "money" },
  { key: (r) => r.spp?.pay ?? null, header: "SPP pay (£)", format: "money" },
  { key: (r) => r.spp?.basis ?? null, header: "SPP basis" },
  // SMP and SAP share these columns; this one says which (HMRC reports them separately).
  { key: (r) => r.smp?.kind ?? null, header: "Maternity or adoption pay (SMP/SAP)" },
  { key: (r) => r.smp?.label ?? null, header: "SMP/SAP phase" },
  { key: (r) => r.smp?.weeklyRate ?? null, header: "SMP/SAP weekly rate (£)", format: "money" },
  { key: (r) => r.smp?.daysInPeriod ?? null, header: "SMP/SAP days" },
  { key: (r) => r.smp?.pay ?? null, header: "SMP/SAP pay (£)", format: "money" },
  { key: (r) => r.smp?.averageWeeklyEarnings ?? null, header: "SMP/SAP average weekly earnings (£)", format: "money" },
  { key: (r) => r.neonatal?.weeksTaken ?? null, header: "Neonatal weeks" },
  { key: (r) => r.neonatal?.weeklyRate ?? null, header: "Neonatal weekly rate (£)", format: "money" },
  { key: (r) => r.neonatal?.estimatedPay ?? null, header: "Neonatal estimated pay (£)", format: "money" },
];

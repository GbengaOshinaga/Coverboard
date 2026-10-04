import type { ExcelSheetSpec, ExportColumn } from "@/lib/export-formats";
import type { SMPPhase } from "@/lib/smpCalculator";

/**
 * The UK compliance report, defined once. The API builds these rows, serves
 * them as JSON for the Reports page, as one CSV per table, and as the Excel
 * compliance pack (one sheet per table), all from the columns below. The
 * page and Settings read the same types, so nothing declares its own copy.
 */

export type BradfordRow = {
  userId: string;
  name: string;
  spells: number;
  days: number;
  score: number;
  flagged: boolean;
};

export type HolidayUsageRow = {
  userId: string;
  name: string;
  department: string | null;
  contractType: string;
  taken: number;
  /** Irregular-hours staff take holiday in hours. */
  unit: "days" | "hours";
};

export type SspLiabilityRow = {
  userId: string;
  name: string;
  /** ISO timestamps. */
  startDate: string;
  endDate: string;
  qualifyingDaysPerWeek: number;
  dailyRate: number;
  daysElapsed: number;
  payableDaysToDate: number;
  estimatedCostToDate: number;
  estimatedTotalCost: number;
  sspDaysPaid: number;
  sspLimitReached: boolean;
  maxDays: number;
  remainingDays: number;
  belowLel: boolean | null;
};

export type ParentalRow = {
  requestId: string;
  userId: string;
  name: string;
  leaveType: string;
  /** ISO timestamps. */
  startDate: string;
  expectedReturnDate: string;
  /**
   * KIT days (maternity/adoption, up to 10) or SPLIT days (shared parental,
   * up to 20); null for leave with neither, e.g. paternity.
   */
  keepingInTouch: {
    kind: "KIT" | "SPLIT";
    used: number;
    allowed: number;
    remaining: number;
  } | null;
  smp: {
    phase: SMPPhase;
    label: string;
    weeklyRate: number | null;
    phase1EndDate: string;
    phase2EndDate: string;
    averageWeeklyEarnings: number | null;
    phase1WeeklyRate: number | null;
    phase2WeeklyRate: number | null;
  } | null;
};

export type RightToWorkRow = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  employmentType: string;
  rightToWorkVerified: boolean | null;
};

export type UkComplianceReport = {
  workforce: { uk: number; total: number };
  holidayUsage: HolidayUsageRow[];
  absenceTrigger: { threshold: number; rows: BradfordRow[] };
  sspLiability: SspLiabilityRow[];
  parentalTracker: ParentalRow[];
  rightToWork: RightToWorkRow[];
};

const day = (iso: string) => iso.slice(0, 10);
const yesNo = (v: boolean) => (v ? "Yes" : "No");

type Table<T> = {
  /** Excel sheet name. */
  sheetName: string;
  /** CSV file name stem. */
  file: string;
  columns: ExportColumn<T>[];
  rows: (report: UkComplianceReport) => T[];
};

/**
 * `sheet` erases the row type so every table fits one list (CSV and the
 * Excel pack); each table's columns are still checked against its own rows.
 */
function table<T>(t: Table<T>) {
  return {
    ...t,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sheet: (report: UkComplianceReport): ExcelSheetSpec<any> => ({
      name: t.sheetName,
      columns: t.columns,
      rows: t.rows(report),
    }),
  };
}

export const UK_COMPLIANCE_TABLES = {
  bradford: table<BradfordRow>({
    sheetName: "Bradford Factor",
    file: "bradford-factor",
    rows: (r) => r.absenceTrigger.rows,
    columns: [
      { key: "userId", header: "Employee ID" },
      { key: "name", header: "Employee" },
      { key: "spells", header: "Sickness spells" },
      { key: "days", header: "Sick days" },
      { key: "score", header: "Bradford score" },
      { key: (r) => yesNo(r.flagged), header: "Above threshold" },
    ],
  }),
  "holiday-usage": table<HolidayUsageRow>({
    sheetName: "Holiday usage",
    file: "holiday-usage",
    rows: (r) => r.holidayUsage,
    columns: [
      { key: "userId", header: "Employee ID" },
      { key: "name", header: "Employee" },
      { key: "department", header: "Department" },
      { key: "contractType", header: "Contract type" },
      { key: "taken", header: "Taken this year" },
      { key: "unit", header: "Unit" },
    ],
  }),
  ssp: table<SspLiabilityRow>({
    sheetName: "SSP liability",
    file: "ssp-liability",
    rows: (r) => r.sspLiability,
    columns: [
      { key: "userId", header: "Employee ID" },
      { key: "name", header: "Employee" },
      { key: (r) => day(r.startDate), header: "Absence start" },
      { key: (r) => day(r.endDate), header: "Absence end" },
      { key: "qualifyingDaysPerWeek", header: "Qualifying days per week" },
      { key: "dailyRate", header: "Daily SSP rate (£)", format: "money" },
      { key: "sspDaysPaid", header: "SSP days" },
      { key: "remainingDays", header: "SSP days remaining" },
      { key: (r) => yesNo(r.sspLimitReached), header: "28-week limit reached" },
      { key: "estimatedCostToDate", header: "Cost to date (£)", format: "money" },
      { key: "estimatedTotalCost", header: "Cost, whole absence (£)", format: "money" },
    ],
  }),
  parental: table<ParentalRow>({
    sheetName: "Parental leave",
    file: "parental-leave",
    rows: (r) => r.parentalTracker,
    columns: [
      { key: "userId", header: "Employee ID" },
      { key: "name", header: "Employee" },
      { key: "leaveType", header: "Leave type" },
      { key: (r) => day(r.startDate), header: "Start date" },
      { key: (r) => day(r.expectedReturnDate), header: "Expected return" },
      { key: (r) => r.keepingInTouch?.kind ?? "None", header: "KIT or SPLIT days" },
      { key: (r) => r.keepingInTouch?.used ?? null, header: "Days used" },
      { key: (r) => r.keepingInTouch?.allowed ?? null, header: "Days allowed" },
      { key: (r) => r.keepingInTouch?.remaining ?? null, header: "Days remaining" },
      { key: (r) => r.smp?.label ?? null, header: "SMP phase" },
      { key: (r) => r.smp?.weeklyRate ?? null, header: "SMP weekly rate (£)", format: "money" },
    ],
  }),
  "right-to-work": table<RightToWorkRow>({
    sheetName: "Right to work",
    file: "right-to-work",
    rows: (r) => r.rightToWork,
    columns: [
      { key: "id", header: "Employee ID" },
      { key: "name", header: "Employee" },
      { key: "email", header: "Email" },
      { key: "department", header: "Department" },
      { key: "employmentType", header: "Employment type" },
      {
        key: (r) => (r.rightToWorkVerified === null ? "Unknown" : yesNo(r.rightToWorkVerified)),
        header: "Right to work checked",
      },
    ],
  }),
};

export type UkComplianceTableId = keyof typeof UK_COMPLIANCE_TABLES;

export function isUkComplianceTableId(v: string | null): v is UkComplianceTableId {
  return v !== null && Object.prototype.hasOwnProperty.call(UK_COMPLIANCE_TABLES, v);
}

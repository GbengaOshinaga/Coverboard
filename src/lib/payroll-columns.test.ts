import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { toCsv, toExcel } from "./export-formats";
import { PAYROLL_EXPORT_COLUMNS, type PayrollRow } from "./payroll-columns";

const base: PayrollRow = {
  leaveRequestId: "lr_1",
  userId: "u_1",
  name: "Brian Lee",
  email: "brian@example.com",
  department: null,
  workCountry: "GB",
  employmentType: "PART_TIME",
  leaveType: "Annual Leave",
  leaveCategory: "STATUTORY",
  isPaid: true,
  startDate: "2026-10-19T00:00:00.000Z",
  endDate: "2026-10-30T00:00:00.000Z",
  daysTaken: 6,
  hoursTaken: null,
  hourlyRate: null,
  dailyHolidayPayRate: 130,
  estimatedPay: 780,
  rateSource: "captured_at_booking",
  smp: null,
  neonatal: null,
  ssp: null,
};

const csvLines = (rows: PayrollRow[]) => toCsv(rows, PAYROLL_EXPORT_COLUMNS, { includeBom: false }).trim().split("\r\n");

test("payroll export headers are fixed (change them here on purpose)", () => {
  assert.deepEqual(PAYROLL_EXPORT_COLUMNS.map((c) => c.header), [
    "Leave request ID", "Employee ID", "Employee", "Email", "Department", "Work country",
    "Employment type", "Leave type", "Category", "Paid", "Start date", "End date",
    "Days taken", "Hours taken", "Daily holiday pay rate (£)", "Hourly holiday pay rate (£)",
    "Estimated holiday pay (£)", "Rate source", "SSP days", "SSP daily rate (£)", "SSP pay (£)", "SMP phase", "SMP weekly rate (£)",
    "SMP average weekly earnings (£)", "Neonatal weeks", "Neonatal weekly rate (£)",
    "Neonatal estimated pay (£)",
  ]);
});

test("UK holiday row: plain dates, Yes/No, money to 2 decimal places", () => {
  const [, row] = csvLines([base]);
  assert.equal(
    row,
    "lr_1,u_1,Brian Lee,brian@example.com,,GB,PART_TIME,Annual Leave,STATUTORY,Yes,2026-10-19,2026-10-30,6,,130.00,,780.00,captured_at_booking,,,,,,,,,"
  );
});

test("maternity row carries SMP into its own columns", () => {
  const [, row] = csvLines([
    {
      ...base,
      leaveType: "Statutory Maternity Leave",
      dailyHolidayPayRate: null,
      estimatedPay: null,
      rateSource: "not_applicable",
      smp: {
        phase: "phase_1",
        label: "Phase 1 (90% AWE)",
        weeklyRate: 405,
        averageWeeklyEarnings: 450,
        phase1EndDate: "2026-11-30T00:00:00.000Z",
        phase2EndDate: "2027-08-23T00:00:00.000Z",
        phase1WeeklyRate: 405,
        phase2WeeklyRate: 194.32,
      },
    },
  ]);
  assert.ok(row.endsWith(",not_applicable,,,,Phase 1 (90% AWE),405.00,450.00,,,"), row);
});

test("non-UK row leaves the UK pay columns empty", () => {
  const { dailyHolidayPayRate: _d, estimatedPay: _e, rateSource: _r, ...rest } = base;
  const [, row] = csvLines([{ ...rest, workCountry: "NG" }]);
  assert.ok(row.includes(",NG,"));
  assert.ok(row.endsWith(",6,,,,,,,,,,,,,,"), row);
});

test("Excel export has the same headers and numeric money cells", async () => {
  const buf = await toExcel([{ name: "Payroll", columns: PAYROLL_EXPORT_COLUMNS, rows: [base] }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Payroll")!;
  const headers = (ws.getRow(1).values as unknown[]).slice(1);
  assert.deepEqual(headers, PAYROLL_EXPORT_COLUMNS.map((c) => c.header));
  // Money is a real number cell formatted to 2dp, so payroll can sum it.
  const payCol = PAYROLL_EXPORT_COLUMNS.findIndex((c) => c.header === "Estimated holiday pay (£)") + 1;
  assert.equal(ws.getRow(2).getCell(payCol).value, 780);
  assert.equal(ws.getColumn(payCol).numFmt, "0.00");
});

test("SSP row: Brian's 6 days at HMRC's 4-decimal rate, paid £246.50", () => {
  const [, row] = csvLines([
    {
      ...base,
      leaveType: "Statutory Sick Pay (SSP)",
      dailyHolidayPayRate: null,
      estimatedPay: null,
      rateSource: "not_applicable",
      ssp: { daysInPeriod: 6, dailyRate: 41.0833, pay: 246.5 },
    },
  ]);
  assert.ok(row.endsWith(",not_applicable,6,41.0833,246.50,,,,,,"), row);
});

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { toCsv, toExcel } from "./export-formats";
import { PAYROLL_EXPORT_COLUMNS, PAYROLL_LEAVER_COLUMNS, type PayrollRow } from "./payroll-columns";

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
  calendarDays: 12,
  hoursTaken: null,
  hourlyRate: null,
  dailyHolidayPayRate: 130,
  estimatedPay: 780,
  rateSource: "captured_at_booking",
  smp: null,
  neonatal: null,
  spp: null,
  shpp: null,
  ssp: null,
};

const csvLines = (rows: PayrollRow[]) => toCsv(rows, PAYROLL_EXPORT_COLUMNS, { includeBom: false }).trim().split("\r\n");

test("payroll export headers are fixed (change them here on purpose)", () => {
  assert.deepEqual(PAYROLL_EXPORT_COLUMNS.map((c) => c.header), [
    "Leave request ID", "Employee ID", "Employee", "Email", "Department", "Work country",
    "Employment type", "Leave type", "Category", "Paid", "Start date", "End date",
    "Working days taken", "Calendar days", "Hours taken", "Daily holiday pay rate (£)", "Hourly holiday pay rate (£)",
    "Estimated holiday pay (£)", "Rate source", "SSP days", "SSP daily rate (£, 4 d.p. per HMRC tables)", "SSP pay (£)", "SSP rate basis",
    "SPP weekly rate (£)", "SPP pay (£)", "SPP basis", "ShPP weekly rate (£)", "ShPP pay (£)", "ShPP basis", "Maternity or adoption pay (SMP/SAP)", "SMP/SAP phase", "SMP/SAP weekly rate (£)", "SMP/SAP days", "SMP/SAP pay (£)",
    "SMP/SAP average weekly earnings (£)", "Neonatal pay days", "Neonatal weekly rate (£)",
    "Neonatal pay (£)", "Neonatal pay basis",
  ]);
});

test("UK holiday row: plain dates, Yes/No, money to 2 decimal places", () => {
  const [, row] = csvLines([base]);
  assert.equal(
    row,
    "lr_1,u_1,Brian Lee,brian@example.com,,GB,PART_TIME,Annual Leave,STATUTORY,Yes,2026-10-19,2026-10-30,6,12,,130.00,,780.00,captured_at_booking,,,,,,,,,,,,,,,,,,,,"
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
        kind: "SMP",
        phase: "phase_1",
        label: "First 6 weeks (90%)",
        weeklyRate: 405,
        daysInPeriod: 28,
        pay: 1620,
        averageWeeklyEarnings: 450,
        phase1EndDate: "2026-11-30T00:00:00.000Z",
        phase2EndDate: "2027-08-23T00:00:00.000Z",
        phase1WeeklyRate: 405,
        phase2WeeklyRate: 194.32,
      },
    },
  ]);
  assert.ok(row.endsWith(",not_applicable,,,,,,,,,,,SMP,First 6 weeks (90%),405.00,28,1620.00,450.00,,,,"), row);
});

test("non-UK row leaves the UK pay columns empty", () => {
  const { dailyHolidayPayRate: _d, estimatedPay: _e, rateSource: _r, ...rest } = base;
  const [, row] = csvLines([{ ...rest, workCountry: "NG" }]);
  assert.ok(row.includes(",NG,"));
  assert.ok(row.endsWith(",6,12" + ",".repeat(25)), row); // 25 empty columns after "Calendar days"
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
      ssp: {
        daysInPeriod: 6,
        dailyRate: 41.0833,
        pay: 246.5,
        averageWeeklyEarnings: 480,
        basis: "Flat rate of £123.25 a week (80% of £480.00 average weekly earnings is more)",
      },
    },
  ]);
  assert.ok(
    row.endsWith(
      ",not_applicable,6,41.0833,246.50,Flat rate of £123.25 a week (80% of £480.00 average weekly earnings is more),,,,,,,,,,,,,,,,"
    ),
    row
  );
});

test("leavers table: holiday to pay, or taken over, with the rate and pay", () => {
  const csv = toCsv(
    [
      { userId: "u_9", name: "Uma Leaver", email: "uma@example.com", department: null, lastDay: "2026-06-30", leaveYear: "2026", unit: "days", accrued: 13.88, carriedOver: 0, taken: 10, owed: 3.88, rate: 100, pay: 388 },
      { userId: "u_8", name: "Tom Over", email: "tom@example.com", department: "Care", lastDay: "2026-03-31", leaveYear: "2026", unit: "days", accrued: 6.9, carriedOver: 0, taken: 20, owed: -13.1, rate: 100, pay: null },
    ],
    PAYROLL_LEAVER_COLUMNS,
    { includeBom: false }
  ).split("\r\n");
  assert.equal(
    csv[0],
    "Employee ID,Employee,Email,Department,Last day,Leave year,Unit,Built up this year,Carried over and owed,Taken,Holiday to pay,Taken over the entitlement,\"Holiday pay rate (£, 52-week average)\",Holiday pay on leaving (£)"
  );
  assert.equal(csv[1], "u_9,Uma Leaver,uma@example.com,,2026-06-30,2026,Days,13.88,0,10,3.88,0,100.00,388.00");
  assert.equal(csv[2], "u_8,Tom Over,tom@example.com,Care,2026-03-31,2026,Days,6.9,0,20,0,13.1,100.00,");
});

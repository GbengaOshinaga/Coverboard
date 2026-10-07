import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { toCsv, toExcel } from "./export-formats";
import {
  UK_COMPLIANCE_TABLES,
  isUkComplianceTableId,
  peopleOnSspToday,
  sspStarted,
  type UkComplianceReport,
} from "./uk-compliance-columns";

const report: UkComplianceReport = {
  workforce: { uk: 3, total: 3 },
  leaveYear: { year: 2026, label: "2026", start: "2026-01-01", end: "2026-12-31", rolloverYear: 2026 },
  holidayUsage: [
    { userId: "u1", name: "Brian", department: null, contractType: "PART_TIME", taken: 6, unit: "days" },
    { userId: "u2", name: "Zoe", department: "Care", contractType: "ZERO_HOURS", taken: 22.5, unit: "hours" },
  ],
  absenceTrigger: {
    threshold: 200,
    rows: [{ userId: "u1", name: "Brian", spells: 3, days: 6, score: 54, flagged: false }],
  },
  sspLiability: [
    {
      userId: "u1",
      name: "Brian",
      startDate: "2026-10-19T00:00:00.000Z",
      endDate: "2026-10-30T00:00:00.000Z",
      qualifyingDaysPerWeek: 3,
      dailyRate: 41.0833,
      averageWeeklyEarnings: 480,
      rateBasis: "Flat rate",
      daysElapsed: 6,
      payableDaysToDate: 6,
      estimatedCostToDate: 246.5,
      estimatedTotalCost: 246.5,
      sspDaysPaid: 6,
      sspLimitReached: false,
      maxDays: 84,
      remainingDays: 78,
      belowLel: false,
    },
  ],
  parentalTracker: [
    {
      requestId: "lr_p",
      userId: "u3",
      name: "Tom",
      leaveType: "Statutory Paternity Leave",
      startDate: "2026-10-05T00:00:00.000Z",
      expectedReturnDate: "2026-10-16T00:00:00.000Z",
      leaveWeeks: 2,
      leaveDays: 10,
      keepingInTouch: null,
      smp: null,
    },
    {
      requestId: "lr_s",
      userId: "u4",
      name: "Sara",
      leaveType: "Shared Parental Leave (SPL)",
      startDate: "2026-09-01T00:00:00.000Z",
      expectedReturnDate: "2027-03-01T00:00:00.000Z",
      leaveWeeks: 26.1,
      leaveDays: 130,
      keepingInTouch: { kind: "SPLIT", used: 4, allowed: 20, remaining: 16 },
      smp: null,
    },
  ],
  rightToWork: [
    {
      id: "u1",
      name: "Brian",
      email: "b@example.com",
      department: null,
      employmentType: "PART_TIME",
      rightToWorkVerified: true,
      checkedOn: "2026-09-01",
      expiresOn: "2026-11-20",
      status: "recheck_due",
      statusLabel: "Recheck before 20 Nov 2026",
    },
  ],
};

const csvLines = (id: keyof typeof UK_COMPLIANCE_TABLES) => {
  const sheet = UK_COMPLIANCE_TABLES[id].sheet(report);
  return toCsv(sheet.rows, sheet.columns, { includeBom: false }).trim().split("\r\n");
};

test("compliance export headers are fixed per table (change them here on purpose)", () => {
  const headers = Object.fromEntries(
    Object.entries(UK_COMPLIANCE_TABLES).map(([id, t]) => [id, t.columns.map((c) => c.header)])
  );
  assert.deepEqual(headers, {
    bradford: ["Employee ID", "Employee", "Sickness spells", "Sick days", "Bradford score", "Above threshold"],
    "holiday-usage": ["Employee ID", "Employee", "Department", "Contract type", "Taken this year", "Unit"],
    ssp: [
      "Employee ID", "Employee", "Absence start", "Absence end", "Qualifying days per week",
      "Daily SSP rate (£, 4 d.p. per HMRC tables)", "SSP days", "SSP days remaining", "28-week limit reached",
      "Cost to date (£)", "Cost, whole absence (£)", "Average weekly earnings used (£)",
      "How the rate was worked out",
    ],
    parental: [
      "Employee ID", "Employee", "Leave type", "Start date", "Expected return", "Leave (weeks)", "Leave (working days)",
      "KIT or SPLIT days", "KIT/SPLIT days used", "KIT/SPLIT days allowed", "KIT/SPLIT days remaining",
      "Maternity or adoption pay (SMP/SAP)", "SMP/SAP phase", "SMP/SAP first 6 weeks (£ a week)", "SMP/SAP weeks 7–39 (£ a week)",
    ],
    "right-to-work": [
      "Employee ID", "Employee", "Email", "Department", "Employment type", "Right to work", "Last checked",
      "Permission until",
    ],
  });
});

test("SSP row: plain dates, Yes/No, HMRC 4-decimal rate, money to 2 places", () => {
  assert.equal(csvLines("ssp")[1], "u1,Brian,2026-10-19,2026-10-30,3,41.0833,6,78,No,246.50,246.50,480.00,Flat rate");
});

test("holiday usage says whether it's days or hours", () => {
  assert.deepEqual(csvLines("holiday-usage").slice(1), [
    "u1,Brian,,PART_TIME,6,days",
    "u2,Zoe,Care,ZERO_HOURS,22.5,hours",
  ]);
});

test("right to work shows its status, last check and when permission ends", () => {
  assert.equal(
    csvLines("right-to-work")[1],
    "u1,Brian,b@example.com,,PART_TIME,Recheck before 20 Nov 2026,2026-09-01,2026-11-20"
  );
});

test("table ids are validated before use", () => {
  assert.equal(isUkComplianceTableId("ssp"), true);
  assert.equal(isUkComplianceTableId("toString"), false);
  assert.equal(isUkComplianceTableId(null), false);
});

test("the Excel pack has one sheet per table with the same headers", async () => {
  const buf = await toExcel(Object.values(UK_COMPLIANCE_TABLES).map((t) => t.sheet(report)));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  for (const t of Object.values(UK_COMPLIANCE_TABLES)) {
    const ws = wb.getWorksheet(t.sheetName);
    assert.ok(ws, t.sheetName);
    assert.deepEqual((ws!.getRow(1).values as unknown[]).slice(1), t.columns.map((c) => c.header));
  }
});

test("parental rows say KIT, SPLIT or Not applicable (never blank)", () => {
  assert.deepEqual(csvLines("parental").slice(1), [
    "u3,Tom,Statutory Paternity Leave,2026-10-05,2026-10-16,2,10,Not applicable,Not applicable,Not applicable,Not applicable,,,,",
    "u4,Sara,Shared Parental Leave (SPL),2026-09-01,2027-03-01,26.1,130,SPLIT,4,20,16,,,,",
  ]);
});

test("on SSP today counts people off now, not upcoming sickness or repeat rows", () => {
  const row = (userId: string, start: string, end: string) => ({
    ...report.sspLiability[0],
    userId,
    startDate: `${start}T00:00:00.000Z`,
    endDate: `${end}T00:00:00.000Z`,
  });
  const now = new Date("2026-10-06T10:00:00Z");
  const rows = [
    row("amy", "2026-10-05", "2026-10-09"), // off today
    row("amy", "2026-10-20", "2026-10-23"), // Amy again, later
    row("brian", "2026-10-19", "2026-10-30"), // upcoming
    row("cara", "2026-10-06", "2026-10-06"), // today only
  ];
  assert.equal(peopleOnSspToday(rows, now), 2);
  assert.equal(sspStarted(rows[0], now), true);
  assert.equal(sspStarted(rows[2], now), false);
});

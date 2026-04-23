/**
 * CSV parsing and validation utilities for weekly earnings history import.
 * Pure functions — no DB or Node.js-specific APIs so they run in both
 * the browser (CSV preview) and in node:test suites.
 */

export type ParsedEarningsRow = {
  weekStartDate: string; // YYYY-MM-DD
  grossEarnings: number;
  hoursWorked: number;
  isZeroPayWeek: boolean;
};

export type RowParseError = {
  rowIndex: number; // 1-based (header = row 0)
  raw: string;
  error: string;
};

export type CsvParseResult = {
  valid: ParsedEarningsRow[];
  errors: RowParseError[];
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns true when the YYYY-MM-DD string falls on a Monday (UTC). */
export function isMonday(dateStr: string): boolean {
  if (!ISO_DATE_RE.test(dateStr)) return false;
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay() === 1;
}

/**
 * Parse a CSV string in the format:
 *   week_starting,gross_earnings,hours_worked,zero_pay_week
 *
 * - The header row is required and must contain those exact column names.
 * - Extra columns are silently ignored.
 * - Returns validated rows and per-row errors.
 * - Does NOT check for duplicates against existing DB records — call
 *   {@link findDuplicatesAgainstExisting} for that.
 */
export function parseEarningsCsv(csvText: string): CsvParseResult {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { valid: [], errors: [{ rowIndex: 0, raw: "", error: "File is empty" }] };
  }

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const colIdx = {
    weekStarting: header.indexOf("week_starting"),
    grossEarnings: header.indexOf("gross_earnings"),
    hoursWorked: header.indexOf("hours_worked"),
    zeroPayWeek: header.indexOf("zero_pay_week"),
  };

  const missingCols = Object.entries(colIdx)
    .filter(([, v]) => v === -1)
    .map(([k]) => k.replace(/([A-Z])/g, "_$1").toLowerCase());

  if (missingCols.length > 0) {
    return {
      valid: [],
      errors: [
        {
          rowIndex: 0,
          raw: lines[0],
          error: `Missing required columns: ${missingCols.join(", ")}`,
        },
      ],
    };
  }

  const valid: ParsedEarningsRow[] = [];
  const errors: RowParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = raw.split(",").map((c) => c.trim());
    const rowIndex = i;

    const dateStr = cols[colIdx.weekStarting] ?? "";
    const grossStr = cols[colIdx.grossEarnings] ?? "";
    const hoursStr = cols[colIdx.hoursWorked] ?? "";
    const zeroStr = (cols[colIdx.zeroPayWeek] ?? "").toLowerCase();

    const isZeroPayWeek = zeroStr === "true" || zeroStr === "1" || zeroStr === "yes";

    if (!ISO_DATE_RE.test(dateStr)) {
      errors.push({ rowIndex, raw, error: `Invalid date format "${dateStr}" — expected YYYY-MM-DD` });
      continue;
    }
    if (!isMonday(dateStr)) {
      errors.push({ rowIndex, raw, error: `${dateStr} is not a Monday — week_starting must be a Monday` });
      continue;
    }

    if (isZeroPayWeek) {
      valid.push({ weekStartDate: dateStr, grossEarnings: 0, hoursWorked: 0, isZeroPayWeek: true });
      continue;
    }

    if (grossStr === "" || grossStr === undefined) {
      errors.push({ rowIndex, raw, error: "gross_earnings is required when zero_pay_week is false" });
      continue;
    }
    const grossEarnings = Number(grossStr);
    if (!Number.isFinite(grossEarnings)) {
      errors.push({ rowIndex, raw, error: `gross_earnings "${grossStr}" is not a valid number` });
      continue;
    }
    if (grossEarnings < 0) {
      errors.push({ rowIndex, raw, error: "gross_earnings cannot be negative" });
      continue;
    }
    if (grossEarnings > 1_000_000) {
      errors.push({ rowIndex, raw, error: "gross_earnings exceeds maximum (1,000,000)" });
      continue;
    }

    const hoursWorked = Number(hoursStr);
    if (!Number.isFinite(hoursWorked) || hoursWorked < 0 || hoursWorked > 168) {
      errors.push({ rowIndex, raw, error: `hours_worked "${hoursStr}" must be a number between 0 and 168` });
      continue;
    }

    valid.push({ weekStartDate: dateStr, grossEarnings, hoursWorked, isZeroPayWeek: false });
  }

  return { valid, errors };
}

/**
 * Detect rows whose week_starting date appears more than once within
 * the same file. All duplicates (including the first occurrence after
 * the initial one) are returned as errors.
 */
export function findIntraFileDuplicates(rows: ParsedEarningsRow[]): RowParseError[] {
  const seen = new Map<string, number>(); // date → first occurrence index (1-based)
  const dupes: RowParseError[] = [];

  rows.forEach((row, i) => {
    const existing = seen.get(row.weekStartDate);
    if (existing !== undefined) {
      dupes.push({
        rowIndex: i + 1,
        raw: `${row.weekStartDate},${row.grossEarnings},${row.hoursWorked},${row.isZeroPayWeek}`,
        error: `Duplicate week_starting ${row.weekStartDate} — already appears at row ${existing}`,
      });
    } else {
      seen.set(row.weekStartDate, i + 1);
    }
  });

  return dupes;
}

/**
 * Cross-reference parsed rows against a set of already-persisted dates.
 * Returns an error for each row whose date already exists in the database.
 */
export function findDuplicatesAgainstExisting(
  rows: ParsedEarningsRow[],
  existingDates: string[]
): RowParseError[] {
  const existingSet = new Set(existingDates);
  return rows
    .map((row, i) => {
      if (existingSet.has(row.weekStartDate)) {
        return {
          rowIndex: i + 1,
          raw: `${row.weekStartDate},${row.grossEarnings},${row.hoursWorked},${row.isZeroPayWeek}`,
          error: `Earnings for ${row.weekStartDate} already exist — edit the existing record instead`,
        };
      }
      return null;
    })
    .filter((e): e is RowParseError => e !== null);
}

/** ISO date string for the most recent Monday on or before today (UTC). */
export function nearestPastMonday(referenceDate = new Date()): string {
  const d = new Date(referenceDate);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const daysBack = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** Generate the CSV template string (headers only). */
export const CSV_TEMPLATE =
  "week_starting,gross_earnings,hours_worked,zero_pay_week\n" +
  "2026-01-05,650.00,37.5,false\n" +
  "2026-01-12,720.50,40.0,false\n" +
  "2026-01-19,0,0,true\n";

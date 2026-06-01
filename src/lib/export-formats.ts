/**
 * Export-format helpers — Scale tier feature.
 *
 * Coverboard's report APIs default to JSON (the dashboard consumes them
 * directly). For payroll and compliance hand-off we also need CSV (the
 * universal lingua franca for finance tools) and Excel (what HR/finance
 * staff actually open by default).
 *
 * The CSV serialiser here is intentionally small — full RFC 4180 escaping
 * (quote-wrap when the value contains comma, quote, newline, or carriage
 * return; double up internal quotes) plus a UTF-8 BOM so Excel opens
 * non-ASCII without mojibake. No library; CSV's tiny enough that a
 * dependency would be more risk than benefit.
 *
 * The XLSX path uses exceljs, which writes proper binary .xlsx the way
 * payroll teams expect. We don't try to style or chart — just typed
 * columns and a header row.
 */

import ExcelJS from "exceljs";

export type ExportFormat = "json" | "csv" | "excel";

export function parseExportFormat(value: string | null): ExportFormat {
  const v = value?.toLowerCase();
  if (v === "csv") return "csv";
  if (v === "excel" || v === "xlsx") return "excel";
  return "json";
}

export type ExportColumn<T> = {
  /** Object key, or a callable accessor for derived values. */
  key: keyof T | ((row: T) => unknown);
  /** Column header in CSV/Excel. */
  header: string;
};

function cellValueOf<T>(row: T, column: ExportColumn<T>): unknown {
  if (typeof column.key === "function") return column.key(row);
  return (row as Record<string, unknown>)[column.key as string];
}

/** RFC 4180 CSV cell escaping. Wraps in quotes only when necessary. */
function escapeCsvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let value: string;
  if (raw instanceof Date) {
    value = raw.toISOString();
  } else if (typeof raw === "object") {
    value = JSON.stringify(raw);
  } else {
    value = String(raw);
  }
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv<T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<ExportColumn<T>>,
  options: { includeBom?: boolean } = {}
): string {
  const includeBom = options.includeBom ?? true;
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const body = rows
    .map((row) =>
      columns.map((c) => escapeCsvCell(cellValueOf(row, c))).join(",")
    )
    .join("\r\n");
  // \r\n line endings per RFC 4180 — Excel cares.
  const bom = includeBom ? "﻿" : "";
  return body.length > 0 ? `${bom}${header}\r\n${body}\r\n` : `${bom}${header}\r\n`;
}

export type ExcelSheetSpec<T> = {
  name: string;
  columns: ReadonlyArray<ExportColumn<T>>;
  rows: ReadonlyArray<T>;
};

/**
 * Serialise one or more sheets to a binary XLSX buffer. Each sheet has
 * its own column list and row set — useful when a single export has
 * separate tables (e.g. compliance report with workforce + bradford +
 * parental tabs).
 *
 * The sheet array is intentionally heterogeneous — each sheet's columns
 * are typed against its own row shape at the call site, so we erase to
 * `any` here rather than force a useless lowest-common-denominator.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function toExcel(
  sheets: ReadonlyArray<ExcelSheetSpec<any>>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = "Coverboard";

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31)); // Excel limit
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: typeof c.key === "function" ? c.header : (c.key as string),
      width: Math.min(Math.max(c.header.length + 4, 12), 40),
    }));
    for (const row of sheet.rows) {
      const cells = sheet.columns.map((c) => cellValueOf(row, c));
      ws.addRow(cells);
    }
    // Bold the header row.
    ws.getRow(1).font = { bold: true };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export const EXPORT_CONTENT_TYPE: Record<ExportFormat, string> = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function exportFilename(
  base: string,
  format: ExportFormat,
  now: Date
): string {
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const ts = now.toISOString().slice(0, 10);
  const ext = format === "excel" ? "xlsx" : format;
  return `${safe}-${ts}.${ext}`;
}

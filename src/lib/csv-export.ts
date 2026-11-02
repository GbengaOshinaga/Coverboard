/** A number written as text, like -12.50: safe, and must stay a number. */
const NUMERIC = /^[+-]?\d+(\.\d+)?$/;

/**
 * One CSV cell, for every CSV the app writes. Dates become ISO strings,
 * objects JSON and null/undefined an empty cell; a cell with a comma, quote
 * or line break is quoted (RFC 4180).
 *
 * Text starting with = + - @ (or a tab or carriage return) gets an apostrophe
 * in front, so Excel and Sheets show it as text instead of running it as a
 * formula: a leave note or name like =HYPERLINK(...) typed by anyone on the
 * team would otherwise run when an admin opens the export. Numbers, including
 * negative amounts, are left as they are.
 */
export function csvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let value: string;
  if (raw instanceof Date) value = raw.toISOString();
  else if (typeof raw === "object") value = JSON.stringify(raw);
  else value = String(raw);
  if (typeof raw === "string" && /^[=+\-@\t\r]/.test(value) && value.length > 1 && !NUMERIC.test(value)) {
    value = `'${value}`;
  }
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Convert an array of objects to a CSV string (cells as in csvCell). */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  const escape = csvCell;

  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

/** Trigger a CSV file download in the browser. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

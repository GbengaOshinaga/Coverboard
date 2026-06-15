import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCsv,
  parseExportFormat,
  exportFilename,
  type ExportColumn,
} from "./export-formats";

// ---------- parseExportFormat ----------

test("parseExportFormat maps csv / excel / xlsx", () => {
  assert.equal(parseExportFormat("csv"), "csv");
  assert.equal(parseExportFormat("CSV"), "csv");
  assert.equal(parseExportFormat("excel"), "excel");
  assert.equal(parseExportFormat("xlsx"), "excel");
  assert.equal(parseExportFormat("XLSX"), "excel");
});

test("parseExportFormat falls back to json for unknown / null", () => {
  assert.equal(parseExportFormat(null), "json");
  assert.equal(parseExportFormat(""), "json");
  assert.equal(parseExportFormat("pdf"), "json");
  assert.equal(parseExportFormat("garbage"), "json");
});

// ---------- toCsv: shape ----------

type Row = { id: string; name: string; score: number };
const COLS: ExportColumn<Row>[] = [
  { key: "id", header: "ID" },
  { key: "name", header: "Name" },
  { key: "score", header: "Score" },
];

test("toCsv emits the header row + body with \\r\\n line endings", () => {
  const out = toCsv(
    [
      { id: "a", name: "Alice", score: 12 },
      { id: "b", name: "Bob", score: 34 },
    ],
    COLS,
    { includeBom: false }
  );
  assert.equal(out, "ID,Name,Score\r\na,Alice,12\r\nb,Bob,34\r\n");
});

test("toCsv emits header only when rows is empty (no body, still terminated)", () => {
  assert.equal(
    toCsv([], COLS, { includeBom: false }),
    "ID,Name,Score\r\n"
  );
});

test("toCsv prepends a UTF-8 BOM by default so Excel reads UTF-8 correctly", () => {
  const out = toCsv([{ id: "a", name: "Alice", score: 12 }], COLS);
  // U+FEFF is 0xEF 0xBB 0xBF; in JS string it's "﻿"
  assert.equal(out.charCodeAt(0), 0xfeff);
});

// ---------- toCsv: escaping ----------

test("toCsv quote-wraps values that contain commas", () => {
  const out = toCsv(
    [{ id: "a", name: "Smith, John", score: 10 }],
    COLS,
    { includeBom: false }
  );
  assert.match(out, /"Smith, John"/);
});

test("toCsv quote-wraps and doubles quotes when the value contains a quote", () => {
  const out = toCsv(
    [{ id: "a", name: 'O"Brien', score: 10 }],
    COLS,
    { includeBom: false }
  );
  // The single internal " becomes "" inside the quoted cell.
  assert.match(out, /"O""Brien"/);
});

test("toCsv quote-wraps newlines and carriage returns inside values", () => {
  const out = toCsv(
    [{ id: "a", name: "line one\nline two", score: 10 }],
    COLS,
    { includeBom: false }
  );
  assert.match(out, /"line one\nline two"/);
});

test("toCsv handles null and undefined as empty cells (not 'null' / 'undefined')", () => {
  type NullableRow = { name: string | null; score: number | undefined };
  const out = toCsv<NullableRow>(
    [{ name: null, score: undefined }],
    [
      { key: "name", header: "Name" },
      { key: "score", header: "Score" },
    ],
    { includeBom: false }
  );
  assert.equal(out, "Name,Score\r\n,\r\n");
});

test("toCsv emits Date values as ISO 8601 strings", () => {
  type DateRow = { id: string; when: Date };
  const out = toCsv<DateRow>(
    [{ id: "a", when: new Date("2026-05-31T12:00:00Z") }],
    [
      { key: "id", header: "ID" },
      { key: "when", header: "When" },
    ],
    { includeBom: false }
  );
  assert.match(out, /a,2026-05-31T12:00:00\.000Z/);
});

// ---------- toCsv: function accessors (derived columns) ----------

test("toCsv supports function-based column accessors", () => {
  const out = toCsv(
    [{ id: "a", name: "Alice", score: 12 }],
    [
      { key: (r) => r.id.toUpperCase(), header: "ID" },
      { key: (r) => `${r.name} (${r.score})`, header: "Display" },
    ],
    { includeBom: false }
  );
  assert.equal(out, "ID,Display\r\nA,Alice (12)\r\n");
});

// ---------- exportFilename ----------

test("exportFilename produces a date-stamped name with the right extension per format", () => {
  const now = new Date("2026-06-01T09:00:00Z");
  assert.equal(
    exportFilename("payroll-may-2026", "csv", now),
    "payroll-may-2026-2026-06-01.csv"
  );
  assert.equal(
    exportFilename("payroll-may-2026", "excel", now),
    "payroll-may-2026-2026-06-01.xlsx"
  );
  assert.equal(
    exportFilename("payroll-may-2026", "json", now),
    "payroll-may-2026-2026-06-01.json"
  );
});

test("exportFilename sanitises unsafe filename characters", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const name = exportFilename("Coverboard / Acme Inc.", "csv", now);
  assert.match(name, /^Coverboard_Acme_Inc.-2026-06-01\.csv$/);
});

"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
} from "lucide-react";

const TEMPLATE_HEADERS = [
  "name",
  "email",
  "role",
  "memberType",
  "employmentType",
  "daysWorkedPerWeek",
  "fteRatio",
  "department",
  "countryCode",
  "rightToWorkVerified",
];

const TEMPLATE_ROWS: string[][] = [
  [
    "Alice Smith",
    "alice@example.com",
    "MEMBER",
    "EMPLOYEE",
    "FULL_TIME",
    "5",
    "1",
    "Engineering",
    "GB",
    "yes",
  ],
  [
    "Bob Jones",
    "bob@example.com",
    "MANAGER",
    "EMPLOYEE",
    "PART_TIME",
    "3",
    "0.6",
    "Sales",
    "GB",
    "",
  ],
];

// Minimal RFC-4180-ish CSV parser that handles quoted fields, escaped quotes
// and CRLF line endings. Sufficient for human-authored team-import files.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cur.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (s === "" || s === "unknown") return null;
  if (["yes", "y", "true", "1", "verified"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

type Row = {
  name: string;
  email: string;
  role: string;
  memberType: string;
  employmentType: string;
  daysWorkedPerWeek: number;
  fteRatio: number;
  department?: string;
  countryCode: string;
  rightToWorkVerified: boolean | null;
};

function normalizeRows(csv: string): Row[] {
  const parsed = parseCSV(csv);
  if (parsed.length === 0) return [];
  const headers = parsed[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name.toLowerCase());

  return parsed.slice(1).map((cells) => {
    const get = (name: string): string => {
      const idx = col(name);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    const days = parseFloat(get("daysWorkedPerWeek"));
    const fte = parseFloat(get("fteRatio"));
    return {
      name: get("name"),
      email: get("email"),
      role: (get("role") || "MEMBER").toUpperCase(),
      memberType: (get("memberType") || "EMPLOYEE").toUpperCase(),
      employmentType: (get("employmentType") || "FULL_TIME").toUpperCase(),
      daysWorkedPerWeek: Number.isFinite(days) ? days : 5,
      fteRatio: Number.isFinite(fte) ? fte : 1,
      department: get("department") || undefined,
      countryCode: (get("countryCode") || "GB").toUpperCase(),
      rightToWorkVerified: parseBool(get("rightToWorkVerified")),
    };
  });
}

function downloadTemplate() {
  const lines = [
    TEMPLATE_HEADERS.join(","),
    ...TEMPLATE_ROWS.map((r) => r.join(",")),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "team-members-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type DryRunError = { index: number; field?: string; message: string };

type Preview = {
  rows: Row[];
  valid: number;
  invalid: number;
  errors: DryRunError[];
};

export function BulkImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const rowErrorsByIndex = useMemo(() => {
    const m = new Map<number, string[]>();
    if (!preview) return m;
    for (const e of preview.errors) {
      if (e.index < 0) continue;
      if (!m.has(e.index)) m.set(e.index, []);
      m.get(e.index)!.push(e.field ? `${e.field}: ${e.message}` : e.message);
    }
    return m;
  }, [preview]);

  const batchErrors = useMemo(
    () => (preview ? preview.errors.filter((e) => e.index < 0) : []),
    [preview]
  );

  function reset() {
    setCsvText("");
    setPreview(null);
    setParsing(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    if (importing) return;
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    try {
      const text = await file.text();
      setCsvText(text);
      setPreview(null);
    } catch {
      toast("Could not read file", "error");
    }
  }

  async function handlePreview() {
    const rows = normalizeRows(csvText);
    if (rows.length === 0) {
      toast("No rows found — check the header row and content", "error");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/team-members/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Preview failed", "error");
        return;
      }
      setPreview({
        rows,
        valid: data.valid ?? 0,
        invalid: data.invalid ?? 0,
        errors: data.errors ?? [],
      });
    } catch {
      toast("Preview failed", "error");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!preview || preview.valid === 0 || batchErrors.length > 0) return;

    const skip = new Set(
      preview.errors.filter((e) => e.index >= 0).map((e) => e.index)
    );
    const rowsToSend = preview.rows.filter((_, i) => !skip.has(i));

    setImporting(true);
    try {
      const res = await fetch("/api/team-members/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsToSend }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Import failed", "error");
        setImporting(false);
        return;
      }
      toast(
        `Imported ${data.imported} team member${data.imported === 1 ? "" : "s"}`,
        "success"
      );
      reset();
      onImported();
      onClose();
    } catch {
      toast("Import failed", "error");
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Bulk import team members"
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {!preview && (
          <>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Upload a CSV to invite up to 100 team members at once. Each
              person receives an invite email with a temporary password.{" "}
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
              >
                <Download className="h-3.5 w-3.5" />
                Download template
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                CSV file
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="bulk-csv-text"
                className="block text-sm font-medium text-gray-700"
              >
                Or paste CSV content
              </label>
              <textarea
                id="bulk-csv-text"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`${TEMPLATE_HEADERS.join(",")}\nAlice Smith,alice@example.com,MEMBER,EMPLOYEE,FULL_TIME,5,1,Engineering,GB,yes`}
                rows={6}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                First row must be a header. Required columns:{" "}
                <code className="text-[11px]">name</code>,{" "}
                <code className="text-[11px]">email</code>,{" "}
                <code className="text-[11px]">countryCode</code>. Other columns
                are optional and fall back to sensible defaults.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handlePreview}
                disabled={parsing || csvText.trim() === ""}
              >
                {parsing ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Validating…
                  </>
                ) : (
                  <>
                    <FileUp className="mr-1.5 h-4 w-4" />
                    Preview
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {preview.valid} ready to invite
              </span>
              {preview.invalid > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 font-medium text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {preview.invalid} with errors
                </span>
              )}
              <span className="text-gray-500">
                {preview.rows.length} total row
                {preview.rows.length === 1 ? "" : "s"}
              </span>
            </div>

            {batchErrors.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {batchErrors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{e.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="max-h-80 overflow-auto rounded-md border border-gray-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Country</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.rows.map((row, i) => {
                    const issues = rowErrorsByIndex.get(i) ?? [];
                    const ok = issues.length === 0;
                    return (
                      <tr
                        key={i}
                        className={ok ? "bg-white" : "bg-red-50/40"}
                      >
                        <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          {ok ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-start gap-1 text-xs font-medium text-red-700">
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{issues.join("; ")}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-800">
                          {row.name || <em className="text-gray-400">—</em>}
                        </td>
                        <td className="px-3 py-2 text-gray-800">
                          {row.email || <em className="text-gray-400">—</em>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{row.role}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {row.countryCode}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPreview(null)}
                disabled={importing}
              >
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={importing}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={
                    importing || preview.valid === 0 || batchErrors.length > 0
                  }
                >
                  {importing ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    `Invite ${preview.valid} member${preview.valid === 1 ? "" : "s"}`
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

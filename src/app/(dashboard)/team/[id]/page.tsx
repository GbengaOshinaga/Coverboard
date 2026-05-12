"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  Pencil,
  Trash2,
  Upload,
  Download,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { COUNTRY_NAMES } from "@/lib/utils";
import { formatEmploymentType } from "@/lib/employment-types";
import {
  parseEarningsCsv,
  findIntraFileDuplicates,
  findDuplicatesAgainstExisting,
  nearestPastMonday,
  CSV_TEMPLATE,
  type ParsedEarningsRow,
  type RowParseError,
} from "@/lib/earningsHistory";

// ─── Types ────────────────────────────────────────────────────────────

type EarningsEntry = {
  id: string;
  weekStartDate: string;
  grossEarnings: string;
  hoursWorked: string;
  isZeroPayWeek: boolean;
};

type EarningsStats = {
  entries: EarningsEntry[];
  averageDailyRate: number | null;
  weeksOnRecord: number;
  paidWeeksCount: number;
};

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  memberType: string;
  employmentType: string;
  daysWorkedPerWeek: number;
  fteRatio: number;
  department: string | null;
  countryCode: string;
  workCountry: string | null;
  bradfordScore: number;
  serviceStartDate: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────

function fmt(date: string | Date) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtMoney(n: number | string) {
  return `£${Number(n).toFixed(2)}`;
}

// Jan 1 2024 is a Monday — use it as the step anchor for the date input.
const MONDAY_ANCHOR = "2024-01-01";

function isMondayInput(dateStr: string) {
  if (!dateStr) return false;
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay() === 1;
}

// ─── Add Week Form ────────────────────────────────────────────────────

function AddWeekForm({
  memberId,
  existingDates,
  onAdded,
}: {
  memberId: string;
  existingDates: string[];
  onAdded: (stats: EarningsStats) => void;
}) {
  const { toast } = useToast();
  const [weekStartDate, setWeekStartDate] = useState(nearestPastMonday());
  const [grossEarnings, setGrossEarnings] = useState("");
  const [hoursWorked, setHoursWorked] = useState("");
  const [isZeroPayWeek, setIsZeroPayWeek] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dateError, setDateError] = useState("");

  function handleZeroToggle(checked: boolean) {
    setIsZeroPayWeek(checked);
    if (checked) {
      setGrossEarnings("");
      setHoursWorked("");
    }
  }

  function handleDateChange(val: string) {
    setWeekStartDate(val);
    if (val && !isMondayInput(val)) {
      setDateError("Please select a Monday");
    } else {
      setDateError("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isMondayInput(weekStartDate)) {
      setDateError("Please select a Monday");
      return;
    }

    if (existingDates.includes(weekStartDate)) {
      setError("Earnings for this week already exist. Edit the existing record instead.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/team-members/${memberId}/earnings-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStartDate,
          grossEarnings: isZeroPayWeek ? 0 : Number(grossEarnings),
          hoursWorked: isZeroPayWeek ? 0 : Number(hoursWorked),
          isZeroPayWeek,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to add week");
        return;
      }

      toast("Week added", "success");
      setWeekStartDate(nearestPastMonday());
      setGrossEarnings("");
      setHoursWorked("");
      setIsZeroPayWeek(false);
      onAdded(await res.json());
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-100 pt-4">
      <p className="text-sm font-medium text-gray-700">Add a week</p>
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          id="weekStartDate"
          label="Week starting (Monday)"
          type="date"
          min={MONDAY_ANCHOR}
          step="7"
          value={weekStartDate}
          onChange={(e) => handleDateChange(e.target.value)}
          error={dateError}
          required
        />
        <Input
          id="grossEarnings"
          label="Gross earnings (£)"
          type="number"
          min="0"
          step="0.01"
          value={grossEarnings}
          onChange={(e) => setGrossEarnings(e.target.value)}
          disabled={isZeroPayWeek}
          required={!isZeroPayWeek}
          placeholder="0.00"
        />
        <Input
          id="hoursWorked"
          label="Hours worked"
          type="number"
          min="0"
          max="168"
          step="0.5"
          value={hoursWorked}
          onChange={(e) => setHoursWorked(e.target.value)}
          disabled={isZeroPayWeek}
          placeholder="37.5"
        />
        <div className="flex flex-col justify-end space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Zero pay week
          </label>
          <label className="flex h-10 items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isZeroPayWeek}
              onChange={(e) => handleZeroToggle(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Mark as zero pay
          </label>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Adding…" : "Add week"}
      </Button>
    </form>
  );
}

// ─── Editable Row ─────────────────────────────────────────────────────

function EarningsRow({
  entry,
  memberId,
  onUpdated,
  onDeleted,
}: {
  entry: EarningsEntry;
  memberId: string;
  onUpdated: (stats: EarningsStats) => void;
  onDeleted: (stats: EarningsStats) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [gross, setGross] = useState(Number(entry.grossEarnings).toFixed(2));
  const [hours, setHours] = useState(Number(entry.hoursWorked).toString());
  const [zero, setZero] = useState(entry.isZeroPayWeek);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/team-members/${memberId}/earnings-history/${entry.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grossEarnings: zero ? 0 : Number(gross),
            hoursWorked: zero ? 0 : Number(hours),
            isZeroPayWeek: zero,
          }),
        }
      );
      if (!res.ok) {
        toast("Failed to update", "error");
        return;
      }
      toast("Updated", "success");
      setEditing(false);
      onUpdated(await res.json());
    } catch {
      toast("Something went wrong", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/team-members/${memberId}/earnings-history/${entry.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        toast("Failed to delete", "error");
        return;
      }
      toast("Deleted", "success");
      onDeleted(await res.json());
    } catch {
      toast("Something went wrong", "error");
    } finally {
      setDeleting(false);
    }
  }

  function handleZero(checked: boolean) {
    setZero(checked);
    if (checked) {
      setGross("0.00");
      setHours("0");
    }
  }

  if (editing) {
    return (
      <tr className="bg-amber-50">
        <td className="px-3 py-2 text-sm text-gray-700">{fmt(entry.weekStartDate)}</td>
        <td className="px-3 py-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            disabled={zero}
            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min="0"
            max="168"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            disabled={zero}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={zero}
            onChange={(e) => handleZero(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td className="px-3 py-2 text-sm text-gray-900">{fmt(entry.weekStartDate)}</td>
      <td className="px-3 py-2 text-sm text-gray-900">
        {entry.isZeroPayWeek ? (
          <span className="text-gray-400">—</span>
        ) : (
          fmtMoney(entry.grossEarnings)
        )}
      </td>
      <td className="px-3 py-2 text-sm text-gray-900">
        {entry.isZeroPayWeek ? (
          <span className="text-gray-400">—</span>
        ) : (
          Number(entry.hoursWorked).toFixed(1)
        )}
      </td>
      <td className="px-3 py-2">
        {entry.isZeroPayWeek ? (
          <Badge variant="warning">Zero pay</Badge>
        ) : (
          <span className="text-sm text-gray-400">No</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── CSV Import ───────────────────────────────────────────────────────

function CsvImport({
  memberId,
  existingDates,
  onImported,
}: {
  memberId: string;
  existingDates: string[];
  onImported: (stats: EarningsStats) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<ParsedEarningsRow[]>([]);
  const [previewErrors, setPreviewErrors] = useState<RowParseError[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const { valid, errors } = parseEarningsCsv(text);

      // Combine intra-file and against-existing duplicate errors
      const intraDupes = findIntraFileDuplicates(valid);
      const dbDupes = findDuplicatesAgainstExisting(valid, existingDates);
      const allErrors = [...errors, ...intraDupes, ...dbDupes];

      // Remove rows flagged by intra/db duplicates from valid list
      const dupeIndices = new Set([
        ...intraDupes.map((d) => d.rowIndex - 1),
        ...dbDupes.map((d) => d.rowIndex - 1),
      ]);
      const cleanRows = valid.filter((_, i) => !dupeIndices.has(i));

      setPreviewRows(cleanRows);
      setPreviewErrors(allErrors);
      setShowPreview(true);
    };
    reader.readAsText(file);
  }

  async function handleConfirm() {
    if (previewRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(
        `/api/team-members/${memberId}/earnings-history/bulk-import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: previewRows }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        toast(data.error ?? "Import failed", "error");
        return;
      }
      const data = await res.json();
      toast(`${data.imported} week${data.imported !== 1 ? "s" : ""} imported`, "success");
      setShowPreview(false);
      setPreviewRows([]);
      setPreviewErrors([]);
      if (fileRef.current) fileRef.current.value = "";
      onImported(data);
    } catch {
      toast("Something went wrong", "error");
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "earnings-history-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="sr-only"
          />
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Upload className="h-3.5 w-3.5" />
            Import from CSV
          </span>
        </label>
        <button
          onClick={downloadTemplate}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV template
        </button>
      </div>

      <Dialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title="CSV import preview"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800 font-medium">
              {previewRows.length} row{previewRows.length !== 1 ? "s" : ""} ready to import
            </span>
            {previewErrors.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-red-800 font-medium">
                {previewErrors.length} row{previewErrors.length !== 1 ? "s" : ""} with errors
              </span>
            )}
          </div>

          {previewErrors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
              {previewErrors.map((err, i) => (
                <p key={i} className="text-xs text-red-800">
                  <span className="font-medium">Row {err.rowIndex}:</span> {err.error}
                </p>
              ))}
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-3">Week starting</th>
                    <th className="py-2 pr-3">Gross earnings</th>
                    <th className="py-2 pr-3">Hours worked</th>
                    <th className="py-2">Zero pay</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 pr-3 text-gray-900">{fmt(row.weekStartDate)}</td>
                      <td className="py-1.5 pr-3 text-gray-900">
                        {row.isZeroPayWeek ? "—" : fmtMoney(row.grossEarnings)}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-900">
                        {row.isZeroPayWeek ? "—" : row.hoursWorked.toFixed(1)}
                      </td>
                      <td className="py-1.5 text-gray-900">
                        {row.isZeroPayWeek ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={importing || previewRows.length === 0}
            >
              {importing ? "Importing…" : `Import ${previewRows.length} row${previewRows.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: memberId } = use(params);
  const { data: session } = useSession();
  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const canManage = userRole === "ADMIN" || userRole === "MANAGER";
  const isAdmin = userRole === "ADMIN";

  const [member, setMember] = useState<Member | null>(null);
  const [stats, setStats] = useState<EarningsStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [memberRes, earningsRes] = await Promise.all([
      fetch(`/api/team-members/${memberId}`),
      fetch(`/api/team-members/${memberId}/earnings-history`),
    ]);
    if (memberRes.ok) setMember(await memberRes.json());
    if (earningsRes.ok) setStats(await earningsRes.json());
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const existingDates = (stats?.entries ?? []).map((e) =>
    new Date(e.weekStartDate).toISOString().slice(0, 10)
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 py-4">
        <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-96 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center">
        <p className="text-gray-500">Employee not found.</p>
        <Link href="/team" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
          ← Back to team
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/team"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{member.name}</h1>
          <p className="text-sm text-gray-500">{member.email}</p>
        </div>
      </div>

      {/* Member overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={member.name} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={member.role === "ADMIN" ? "default" : "outline"}>
                  {member.role}
                </Badge>
                <Badge variant="outline">{member.memberType}</Badge>
                <Badge variant="outline">
                  Work location:{" "}
                  {member.workCountry
                    ? COUNTRY_NAMES[member.workCountry] ?? member.workCountry
                    : "Not set"}
                </Badge>
                {member.department && (
                  <Badge variant="outline">{member.department}</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {formatEmploymentType(member.employmentType)} · FTE {member.fteRatio} ·{" "}
                {member.daysWorkedPerWeek} days/week
              </p>
              {member.bradfordScore > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Bradford Factor: {member.bradfordScore.toFixed(0)}
                </p>
              )}
            </div>
            {isAdmin && (
              <a
                href={`/api/team-members/${memberId}/export`}
                download
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                title="Subject Access Request (GDPR): download all data held about this employee"
              >
                <Download className="h-3.5 w-3.5" />
                Export data (SAR)
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Holiday pay earnings history (UK-only) */}
      {member.workCountry === "GB" && (
      <Card id="earnings-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-brand-600" />
            Holiday pay earnings history
          </CardTitle>
          <CardDescription>
            UK Working Time Regulations require holiday pay to reflect normal remuneration averaged
            over the last 52 paid weeks. Manage earnings history below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage && (
            <CsvImport
              memberId={memberId}
              existingDates={existingDates}
              onImported={(s) => setStats(s)}
            />
          )}

          {/* Summary stats */}
          {stats && stats.weeksOnRecord > 0 && (
            <div className="flex flex-wrap gap-4 rounded-md border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
              <div>
                <span className="text-gray-500">Weeks on record: </span>
                <span className="font-medium text-gray-900">{stats.weeksOnRecord}</span>
                {stats.paidWeeksCount < stats.weeksOnRecord && (
                  <span className="ml-1 text-gray-400">
                    ({stats.paidWeeksCount} paid)
                  </span>
                )}
              </div>
              <div>
                <span className="text-gray-500">Current average daily rate: </span>
                <span className="font-semibold text-gray-900">
                  {stats.averageDailyRate !== null
                    ? fmtMoney(stats.averageDailyRate)
                    : "—"}
                </span>
              </div>
            </div>
          )}

          {/* Table or empty state */}
          {!stats || stats.weeksOnRecord === 0 ? (
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 py-8 text-center">
              <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-500" />
              <p className="text-sm font-medium text-amber-900">No earnings history yet</p>
              <p className="mt-1 text-xs text-amber-700">
                {member.employmentType === "ZERO_HOURS"
                  ? "Zero-hours holiday pay must use the 52-week earnings average. Add weekly earnings before calculating holiday pay."
                  : "Add weekly earnings below to enable legally compliant holiday pay calculations."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                    <th className="px-3 py-2">Week starting</th>
                    <th className="px-3 py-2">Gross earnings</th>
                    <th className="px-3 py-2">Hours worked</th>
                    <th className="px-3 py-2">Zero pay week</th>
                    {canManage && <th className="px-3 py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {stats.entries
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(b.weekStartDate).getTime() -
                        new Date(a.weekStartDate).getTime()
                    )
                    .map((entry) =>
                      canManage ? (
                        <EarningsRow
                          key={entry.id}
                          entry={entry}
                          memberId={memberId}
                          onUpdated={(s) => setStats(s)}
                          onDeleted={(s) => setStats(s)}
                        />
                      ) : (
                        <tr key={entry.id} className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-900">{fmt(entry.weekStartDate)}</td>
                          <td className="px-3 py-2 text-gray-900">
                            {entry.isZeroPayWeek ? "—" : fmtMoney(entry.grossEarnings)}
                          </td>
                          <td className="px-3 py-2 text-gray-900">
                            {entry.isZeroPayWeek ? "—" : Number(entry.hoursWorked).toFixed(1)}
                          </td>
                          <td className="px-3 py-2">
                            {entry.isZeroPayWeek ? (
                              <Badge variant="warning">Zero pay</Badge>
                            ) : (
                              <span className="text-gray-400">No</span>
                            )}
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
          )}

          {canManage && (
            <AddWeekForm
              memberId={memberId}
              existingDates={existingDates}
              onAdded={(s) => setStats(s)}
            />
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;
const INDIVIDUAL_WARNINGS_MAX = 3;
const PAID_WEEKS_TARGET = 52;

export type EarningsCoverageRow = {
  id: string;
  name: string;
  email: string;
  countryCode: string;
  department: string | null;
  employmentType: string;
  totalWeeks: number;
  paidWeeks: number;
  lastWeekStartDate: string | null;
  hasAnyHistory: boolean;
};

type FilterKey = "missing" | "partial" | "complete" | "all";

function rowStatus(row: EarningsCoverageRow): FilterKey {
  if (!row.hasAnyHistory) return "missing";
  if (row.paidWeeks >= PAID_WEEKS_TARGET) return "complete";
  return "partial";
}

const FILTER_LABELS: Record<FilterKey, string> = {
  missing: "No history",
  partial: "Under 52 paid weeks",
  complete: "52+ paid weeks",
  all: "All UK employees",
};

export function EarningsCoveragePanel({
  employees,
}: {
  employees: EarningsCoverageRow[];
}) {
  const [filter, setFilter] = useState<FilterKey>("missing");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const counts = useMemo(() => {
    let missing = 0;
    let partial = 0;
    let complete = 0;
    for (const e of employees) {
      const s = rowStatus(e);
      if (s === "missing") missing++;
      else if (s === "partial") partial++;
      else complete++;
    }
    return { missing, partial, complete, total: employees.length };
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (filter !== "all" && rowStatus(e) !== filter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.department?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [employees, filter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  function selectFilter(next: FilterKey) {
    setFilter(next);
    setPage(0);
  }

  const missingRows = employees.filter((e) => !e.hasAnyHistory);
  const showIndividualWarnings =
    missingRows.length > 0 && missingRows.length <= INDIVIDUAL_WARNINGS_MAX;

  return (
    <div className="space-y-4">
      {counts.total === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          No UK employees in this organization yet.
        </p>
      ) : (
        <>
          {counts.missing > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p>
                    <strong>{counts.missing}</strong> UK{" "}
                    {counts.missing === 1 ? "employee has" : "employees have"} no
                    earnings history. Holiday pay for them will use{" "}
                    <strong>basic salary only</strong>, which may not meet UK
                    rules when pay includes overtime, commission, or allowances.
                  </p>
                  {counts.missing > INDIVIDUAL_WARNINGS_MAX && (
                    <p className="text-xs text-amber-800">
                      Use the table below to find people and add history on their
                      team profile. You can also open the{" "}
                      <Link
                        href="/team?earnings=missing"
                        className="font-medium underline hover:no-underline"
                      >
                        filtered team list
                      </Link>
                      .
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {counts.missing === 0 && counts.partial === 0 && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              All UK employees have at least 52 paid weeks of earnings on file.
              Keep records up to date for accurate holiday pay.
            </p>
          )}

          {counts.missing === 0 && counts.partial > 0 && (
            <p className="rounded-md border border-amber-100 bg-amber-50/80 p-3 text-sm text-amber-900">
              Everyone has some earnings history, but{" "}
              <strong>{counts.partial}</strong>{" "}
              {counts.partial === 1 ? "employee is" : "employees are"} under the
              52 paid weeks used for statutory holiday pay averaging.
            </p>
          )}

          {showIndividualWarnings &&
            missingRows.map((emp) => (
              <div
                key={emp.id}
                className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <p className="text-amber-900">
                    Holiday pay for <strong>{emp.name}</strong> is based on basic
                    salary only.{" "}
                    <Link
                      href={`/team/${emp.id}#earnings-history`}
                      className="font-medium underline hover:no-underline"
                    >
                      Add earnings history →
                    </Link>
                  </p>
                </div>
              </div>
            ))}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
                const n =
                  key === "missing"
                    ? counts.missing
                    : key === "partial"
                      ? counts.partial
                      : key === "complete"
                        ? counts.complete
                        : counts.total;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectFilter(key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filter === key
                        ? "bg-brand-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {FILTER_LABELS[key]} ({n})
                  </button>
                );
              })}
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="earningsCoverageSearch"
                type="search"
                placeholder="Search name or department…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Paid weeks</th>
                  <th className="px-3 py-2 font-medium">Total weeks</th>
                  <th className="px-3 py-2 font-medium">Last week</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-gray-500"
                    >
                      No employees match this filter.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{e.name}</p>
                        {(e.department || e.email) && (
                          <p className="text-xs text-gray-500">
                            {[e.department, e.email]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 tabular-nums ${
                          e.paidWeeks >= PAID_WEEKS_TARGET
                            ? "text-emerald-700"
                            : e.paidWeeks > 0
                              ? "text-amber-700"
                              : "text-red-700"
                        }`}
                      >
                        {e.paidWeeks}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">
                        {e.totalWeeks}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {e.lastWeekStartDate
                          ? new Date(e.lastWeekStartDate).toLocaleDateString(
                              "en-GB"
                            )
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/team/${e.id}#earnings-history`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          {e.hasAnyHistory ? "Manage" : "Add history"}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
              <p>
                Showing {safePage * PAGE_SIZE + 1}–
                {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-xs tabular-nums">
                  Page {safePage + 1} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() =>
                    setPage((p) => Math.min(pageCount - 1, p + 1))
                  }
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

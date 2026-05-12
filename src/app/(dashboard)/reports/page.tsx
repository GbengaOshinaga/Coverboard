"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Clock,
  Plus,
  Download,
  TrendingUp,
  CalendarClock,
} from "lucide-react";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import {
  formatEmploymentType,
  isHoursAveragedEmploymentType,
} from "@/lib/employment-types";

type BradfordRow = {
  userId: string;
  name: string;
  spells: number;
  days: number;
  score: number;
  flagged: boolean;
};

type RightToWorkRow = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  employmentType: string;
  rightToWorkVerified: boolean | null;
};

type WeeklyHoursEntry = {
  id: string;
  weekStartDate: string;
  hoursWorked: number;
};

type VariableHoursUser = {
  id: string;
  name: string;
  email: string;
  employmentType: string;
};

type UKReport = {
  workforce?: {
    uk: number;
    total: number;
  };
  holidayUsage: Array<{
    userId: string;
    name: string;
    taken: number;
    department: string | null;
    contractType: string;
  }>;
  absenceTrigger: { threshold: number; rows: BradfordRow[] };
  sspLiability: Array<{
    userId: string;
    name: string;
    daysElapsed: number;
    estimatedCostToDate: number;
    startDate: string;
    endDate: string;
  }>;
  parentalTracker: Array<{
    requestId: string;
    userId: string;
    name: string;
    leaveType: string;
    expectedReturnDate: string;
    kitDaysUsed: number;
    kitDaysCap: number;
    kitDaysRemaining: number;
  }>;
  rightToWork: RightToWorkRow[];
};

type ActiveTab =
  | "analytics"
  | "bradford"
  | "right-to-work"
  | "weekly-hours"
  | "holiday-usage"
  | "ssp"
  | "parental"
  | "payroll"
  | "year-end";

type PayrollRow = {
  leaveRequestId: string;
  userId: string;
  name: string;
  email: string;
  department: string | null;
  countryCode: string;
  employmentType: string;
  leaveType: string;
  leaveCategory: string;
  isPaid: boolean;
  startDate: string;
  endDate: string;
  daysTaken: number;
  dailyHolidayPayRate?: number | null;
  estimatedPay?: number | null;
  rateSource?:
    | "captured_at_booking"
    | "recalculated"
    | "not_applicable";
};

type PayrollReport = {
  from: string;
  to: string;
  rows: PayrollRow[];
  totals: {
    rowCount: number;
    totalDays: number;
    totalEstimatedPay: number;
  };
};

type PayrollCsvBaseRow = {
  name: string;
  email: string;
  department: string;
  countryCode: string;
  employmentType: string;
  leaveType: string;
  leaveCategory: string;
  isPaid: string;
  startDate: string;
  endDate: string;
  daysTaken: number;
};

type PayrollCsvFullRow = PayrollCsvBaseRow & {
  dailyHolidayPayRate: string;
  estimatedPay: string;
  rateSource: string;
};

type Analytics = {
  year: number;
  totalDays: number;
  employeeCount: number;
  avgDaysPerEmployee: number;
  monthlyTrend: Array<{ month: string; days: number }>;
  leaveTypeBreakdown: Array<{ name: string; color: string; days: number }>;
  departmentBreakdown: Array<{ department: string; days: number }>;
  topAbsenceUsers: Array<{ name: string; days: number }>;
  yearOverYear: {
    previousYearDays: number;
    changeDays: number;
    changePercent: number | null;
  };
};

type RolloverPreviewRow = {
  userId: string;
  name: string;
  email: string;
  leaveTypeName: string;
  unusedDays: number;
  daysCarried: number;
};

export default function ReportsPage() {
  const { data: session } = useSession();
  const [report, setReport] = useState<UKReport | null>(null);
  const [hasUkWorkforce, setHasUkWorkforce] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("analytics");
  const [threshold, setThreshold] = useState(200);

  const [variableUsers, setVariableUsers] = useState<VariableHoursUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHoursEntry[]>([]);
  const [showAddHours, setShowAddHours] = useState(false);
  const [newWeekDate, setNewWeekDate] = useState("");
  const [newHours, setNewHours] = useState("");
  const [savingHours, setSavingHours] = useState(false);

  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const [payrollFrom, setPayrollFrom] = useState(monthStart);
  const [payrollTo, setPayrollTo] = useState(monthEnd);
  const [payrollReport, setPayrollReport] = useState<PayrollReport | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);

  const [rolloverYear, setRolloverYear] = useState(
    new Date().getFullYear() - 1
  );
  const [rolloverPreview, setRolloverPreview] = useState<
    RolloverPreviewRow[] | null
  >(null);
  const [rolloverProcessing, setRolloverProcessing] = useState(false);

  const { toast } = useToast();

  const user = session?.user as Record<string, unknown> | undefined;
  const userRole = user?.role as string | undefined;
  const isReviewer = userRole === "ADMIN" || userRole === "MANAGER";
  const isAdmin = userRole === "ADMIN";

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/uk-compliance?bradfordThreshold=${threshold}`
      );
      if (res.ok) {
        setHasUkWorkforce(true);
        setReport(await res.json());
      } else if (res.status === 403) {
        const payload = await res.json().catch(() => null);
        if (payload?.error === "NO_UK_EMPLOYEES") {
          setHasUkWorkforce(false);
          setReport(null);
        }
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [threshold]);

  useEffect(() => {
    if (isReviewer) fetchReport();
  }, [fetchReport, isReviewer]);

  useEffect(() => {
    if (
      !hasUkWorkforce &&
      ["bradford", "right-to-work", "holiday-usage", "ssp", "parental", "year-end"].includes(
        activeTab
      )
    ) {
      setActiveTab("analytics");
    }
  }, [hasUkWorkforce, activeTab]);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch("/api/reports/analytics");
        if (res.ok) setAnalytics(await res.json());
      } catch {
        // ignore
      }
    }
    if (isReviewer) fetchAnalytics();
  }, [isReviewer]);

  const fetchPayroll = useCallback(async () => {
    setPayrollLoading(true);
    try {
      const qs = new URLSearchParams();
      if (payrollFrom) qs.set("from", payrollFrom);
      if (payrollTo) qs.set("to", payrollTo);
      const res = await fetch(`/api/reports/payroll?${qs.toString()}`);
      if (res.ok) {
        setPayrollReport(await res.json());
      } else {
        toast("Failed to load payroll report", "error");
      }
    } catch {
      toast("Failed to load payroll report", "error");
    }
    setPayrollLoading(false);
  }, [payrollFrom, payrollTo, toast]);

  useEffect(() => {
    if (activeTab === "payroll" && isReviewer && !payrollReport) {
      fetchPayroll();
    }
  }, [activeTab, isReviewer, payrollReport, fetchPayroll]);

  function exportPayrollCsv() {
    if (!payrollReport) return;
    const includeHolidayRateColumns = payrollReport.rows.some(
      (r) => r.dailyHolidayPayRate !== undefined
    );
    const payrollCsvBaseColumns: { key: keyof PayrollCsvBaseRow; label: string }[] =
      [
        { key: "name", label: "Employee" },
        { key: "email", label: "Email" },
        { key: "department", label: "Department" },
        { key: "countryCode", label: "Country" },
        { key: "employmentType", label: "Employment type" },
        { key: "leaveType", label: "Leave type" },
        { key: "leaveCategory", label: "Category" },
        { key: "isPaid", label: "Paid" },
        { key: "startDate", label: "Start" },
        { key: "endDate", label: "End" },
        { key: "daysTaken", label: "Days taken" },
      ];
    const payrollCsvHolidayColumns: {
      key: keyof Pick<
        PayrollCsvFullRow,
        "dailyHolidayPayRate" | "estimatedPay" | "rateSource"
      >;
      label: string;
    }[] = [
      { key: "dailyHolidayPayRate", label: "Daily holiday pay rate (\u00a3)" },
      { key: "estimatedPay", label: "Estimated pay (\u00a3)" },
      { key: "rateSource", label: "Rate source" },
    ];

    const toBaseRow = (r: PayrollRow): PayrollCsvBaseRow => ({
      name: r.name,
      email: r.email,
      department: r.department ?? "",
      countryCode: r.countryCode,
      employmentType: r.employmentType,
      leaveType: r.leaveType,
      leaveCategory: r.leaveCategory,
      isPaid: r.isPaid ? "Yes" : "No",
      startDate: r.startDate.slice(0, 10),
      endDate: r.endDate.slice(0, 10),
      daysTaken: r.daysTaken,
    });

    if (includeHolidayRateColumns) {
      const rows: PayrollCsvFullRow[] = payrollReport.rows.map((r) => {
        const base = toBaseRow(r);
        if (r.dailyHolidayPayRate === undefined) {
          return {
            ...base,
            dailyHolidayPayRate: "",
            estimatedPay: "",
            rateSource: "",
          };
        }
        return {
          ...base,
          dailyHolidayPayRate:
            r.dailyHolidayPayRate == null
              ? ""
              : r.dailyHolidayPayRate.toFixed(2),
          estimatedPay: r.estimatedPay == null ? "" : r.estimatedPay.toFixed(2),
          rateSource: r.rateSource ?? "",
        };
      });
      downloadCsv(
        `payroll-export-${payrollFrom}-to-${payrollTo}`,
        toCsv(rows, [...payrollCsvBaseColumns, ...payrollCsvHolidayColumns])
      );
      return;
    }

    const rows: PayrollCsvBaseRow[] = payrollReport.rows.map(toBaseRow);
    downloadCsv(
      `payroll-export-${payrollFrom}-to-${payrollTo}`,
      toCsv(rows, payrollCsvBaseColumns)
    );
  }

  async function runRollover(dryRun: boolean) {
    setRolloverProcessing(true);
    try {
      const res = await fetch("/api/carry-over/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromYear: rolloverYear, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Rollover failed", "error");
      } else {
        setRolloverPreview(data.summary);
        toast(
          dryRun
            ? `Preview: ${data.processed} employees would receive carry-over`
            : `Rollover complete: ${data.processed} employees updated`,
          "success"
        );
      }
    } catch {
      toast("Rollover failed", "error");
    }
    setRolloverProcessing(false);
  }

  function exportCsv(tab: ActiveTab) {
    if (tab === "bradford" && report) {
      downloadCsv(
        `bradford-factor-${new Date().toISOString().slice(0, 10)}`,
        toCsv(report.absenceTrigger.rows, [
          { key: "name", label: "Employee" },
          { key: "spells", label: "Sickness spells" },
          { key: "days", label: "Sick days" },
          { key: "score", label: "Bradford score" },
          { key: "flagged", label: "Above threshold" },
        ])
      );
    } else if (tab === "right-to-work" && report) {
      downloadCsv(
        `right-to-work-${new Date().toISOString().slice(0, 10)}`,
        toCsv(report.rightToWork, [
          { key: "name", label: "Employee" },
          { key: "email", label: "Email" },
          { key: "department", label: "Department" },
          { key: "rightToWorkVerified", label: "Verified" },
        ])
      );
    } else if (tab === "holiday-usage" && report) {
      downloadCsv(
        `holiday-usage-${new Date().toISOString().slice(0, 10)}`,
        toCsv(report.holidayUsage, [
          { key: "name", label: "Employee" },
          { key: "department", label: "Department" },
          { key: "contractType", label: "Contract" },
          { key: "taken", label: "Days taken" },
        ])
      );
    } else if (tab === "ssp" && report) {
      downloadCsv(
        `ssp-liability-${new Date().toISOString().slice(0, 10)}`,
        toCsv(report.sspLiability, [
          { key: "name", label: "Employee" },
          { key: "startDate", label: "Start date" },
          { key: "daysElapsed", label: "Days elapsed" },
          { key: "estimatedCostToDate", label: "Estimated cost (GBP)" },
        ])
      );
    } else if (tab === "parental" && report) {
      downloadCsv(
        `parental-leave-${new Date().toISOString().slice(0, 10)}`,
        toCsv(report.parentalTracker, [
          { key: "name", label: "Employee" },
          { key: "leaveType", label: "Leave type" },
          { key: "expectedReturnDate", label: "Expected return" },
          { key: "kitDaysUsed", label: "KIT days used" },
          { key: "kitDaysRemaining", label: "KIT days remaining" },
          { key: "kitDaysCap", label: "KIT days cap" },
        ])
      );
    }
  }

  function exportFullPack() {
    if (!report) return;
    const date = new Date().toISOString().slice(0, 10);
    exportCsv("bradford");
    setTimeout(() => exportCsv("right-to-work"), 250);
    setTimeout(() => exportCsv("holiday-usage"), 500);
    setTimeout(() => exportCsv("ssp"), 750);
    setTimeout(() => exportCsv("parental"), 1000);
    toast(`UK compliance report pack exported (${date})`, "success");
  }

  useEffect(() => {
    async function fetchVariableUsers() {
      try {
        const res = await fetch("/api/team-members");
        if (res.ok) {
          const all = await res.json();
          setVariableUsers(
            all.filter(
              (u: VariableHoursUser) =>
                isHoursAveragedEmploymentType(u.employmentType)
            )
          );
        }
      } catch {
        // ignore
      }
    }
    if (isReviewer) fetchVariableUsers();
  }, [isReviewer]);

  useEffect(() => {
    async function loadHours() {
      if (!selectedUser) {
        setWeeklyHours([]);
        return;
      }
      try {
        const res = await fetch(`/api/weekly-hours?userId=${selectedUser}`);
        if (res.ok) setWeeklyHours(await res.json());
      } catch {
        // ignore
      }
    }
    loadHours();
  }, [selectedUser]);

  async function handleAddHours(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setSavingHours(true);
    try {
      const res = await fetch("/api/weekly-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser,
          weekStartDate: newWeekDate,
          hoursWorked: parseFloat(newHours),
        }),
      });
      if (res.ok) {
        toast("Hours recorded", "success");
        setShowAddHours(false);
        setNewWeekDate("");
        setNewHours("");
        const refresh = await fetch(
          `/api/weekly-hours?userId=${selectedUser}`
        );
        if (refresh.ok) setWeeklyHours(await refresh.json());
      } else {
        const err = await res.json();
        toast(err.error || "Failed to save hours", "error");
      }
    } catch {
      toast("Failed to save hours", "error");
    }
    setSavingHours(false);
  }

  if (!isReviewer) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          Reports
        </h1>
        <p className="text-sm text-gray-500">
          Reports are available to admins and managers only.
        </p>
      </div>
    );
  }

  const allTabs: {
    id: ActiveTab;
    label: string;
    adminOnly?: boolean;
    requiresUk?: boolean;
  }[] = [
    { id: "analytics", label: "Analytics" },
    { id: "bradford", label: "Bradford Factor", requiresUk: true },
    { id: "right-to-work", label: "Right to work", requiresUk: true },
    { id: "weekly-hours", label: "Weekly hours" },
    { id: "holiday-usage", label: "Holiday usage", requiresUk: true },
    { id: "ssp", label: "SSP liability", requiresUk: true },
    { id: "parental", label: "Parental leave", requiresUk: true },
    { id: "payroll", label: "Payroll export" },
    { id: "year-end", label: "Year-end rollover", adminOnly: true, requiresUk: true },
  ];
  const tabs = allTabs.filter(
    (t) => (!t.adminOnly || isAdmin) && (!t.requiresUk || hasUkWorkforce)
  );

  const ukOnlyNote =
    report?.workforce && report.workforce.total > 0
      ? `Showing results for UK-based employees only (${report.workforce.uk} of ${report.workforce.total} employees)`
      : null;

  const bradfordRows = report?.absenceTrigger.rows ?? [];
  const sortedBradford = [...bradfordRows].sort((a, b) => b.score - a.score);
  const flaggedCount = bradfordRows.filter((r) => r.flagged).length;

  const rtwRows = report?.rightToWork ?? [];
  const rtwUnverified = rtwRows.filter(
    (r) => r.rightToWorkVerified !== true
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            Reports
          </h1>
          <p className="text-sm text-gray-500">
            Workforce analytics
            {hasUkWorkforce
              ? " and UK compliance reporting"
              : " (UK compliance reports appear automatically when you add UK-based employees)"}
          </p>
        </div>
        {hasUkWorkforce && (
          <Button size="sm" variant="outline" onClick={exportFullPack}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export compliance pack
          </Button>
        )}
      </div>

      {/* Summary cards */}
      {hasUkWorkforce && report && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            className="cursor-pointer hover:border-brand-200"
            onClick={() => setActiveTab("bradford")}
          >
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{flaggedCount}</p>
                  <p className="text-xs text-gray-500">
                    Bradford triggers (&ge;{threshold})
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-brand-200"
            onClick={() => setActiveTab("right-to-work")}
          >
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                {rtwUnverified > 0 ? (
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                )}
                <div>
                  <p className="text-2xl font-bold">{rtwUnverified}</p>
                  <p className="text-xs text-gray-500">Unverified right to work</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-brand-200"
            onClick={() => setActiveTab("ssp")}
          >
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {report.sspLiability.length}
                  </p>
                  <p className="text-xs text-gray-500">On SSP currently</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-brand-200"
            onClick={() => setActiveTab("parental")}
          >
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {report.parentalTracker.length}
                  </p>
                  <p className="text-xs text-gray-500">Active parental leave</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          {/* Bradford Factor */}
          {activeTab === "bradford" && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle>Bradford Factor scores</CardTitle>
                    <CardDescription>
                      S&sup2; &times; D — higher scores indicate frequent
                      short-term absences. The formula uses sickness spells (S)
                      and total sick days (D) over the last 12 months.
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="mt-2 text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <Input
                      id="threshold"
                      label="Threshold"
                      type="number"
                      min="0"
                      value={String(threshold)}
                      onChange={(e) =>
                        setThreshold(parseInt(e.target.value || "0", 10))
                      }
                      className="w-24"
                    />
                    <Button size="sm" onClick={fetchReport}>
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportCsv("bradford")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sortedBradford.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No UK employees found.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4 text-right">Spells</th>
                          <th className="pb-2 pr-4 text-right">Days</th>
                          <th className="pb-2 pr-4 text-right">Score</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedBradford.map((row) => (
                          <tr
                            key={row.userId}
                            className="border-b border-gray-50"
                          >
                            <td className="py-2.5 pr-4 font-medium text-gray-900">
                              {row.name}
                            </td>
                            <td className="py-2.5 pr-4 text-right text-gray-600">
                              {row.spells}
                            </td>
                            <td className="py-2.5 pr-4 text-right text-gray-600">
                              {row.days}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono font-medium">
                              {row.score}
                            </td>
                            <td className="py-2.5">
                              {row.flagged ? (
                                <Badge variant="error">Above threshold</Badge>
                              ) : (
                                <Badge variant="success">OK</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Right to work */}
          {activeTab === "right-to-work" && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Right to work verification</CardTitle>
                    <CardDescription>
                      Compliance status for all UK employees. Unverified
                      employees are flagged.
                      {rtwRows.some(
                        (r) =>
                          r.employmentType === "ZERO_HOURS" &&
                          r.rightToWorkVerified !== true
                      )
                        ? " Right to work verification is especially important for zero-hours and bank staff."
                        : ""}
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="mt-2 text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportCsv("right-to-work")}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {rtwRows.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No UK employees found.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4">Email</th>
                          <th className="pb-2 pr-4">Department</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rtwRows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-gray-50"
                          >
                            <td className="py-2.5 pr-4 font-medium text-gray-900">
                              {row.name}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {row.email}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {row.department ?? "—"}
                            </td>
                            <td className="py-2.5">
                              {row.rightToWorkVerified === true ? (
                                <Badge variant="success">Verified</Badge>
                              ) : row.rightToWorkVerified === false ? (
                                <Badge variant="error">Not verified</Badge>
                              ) : (
                                <Badge variant="outline">Unknown</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Weekly hours management */}
          {activeTab === "weekly-hours" && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle>Variable and zero-hours tracking</CardTitle>
                    <CardDescription>
                      Record weekly hours for variable-hours and zero-hours
                      employees. The last 52 weeks are used to calculate their
                      FTE ratio and pro-rated annual leave entitlement.
                    </CardDescription>
                  </div>
                  {selectedUser && (
                    <Button size="sm" onClick={() => setShowAddHours(true)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add entry
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  id="variableUser"
                  label="Select employee"
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  options={[
                    { value: "", label: "Choose an employee..." },
                    ...variableUsers.map((u) => ({
                      value: u.id,
                      label: `${u.name} (${formatEmploymentType(
                        u.employmentType
                      )})`,
                    })),
                  ]}
                />

                {variableUsers.length === 0 && (
                  <p className="text-sm text-gray-400">
                    No variable-hours or zero-hours employees found. Set an
                    employee&apos;s employment type on the Team page first.
                  </p>
                )}

                {selectedUser && weeklyHours.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No weekly hours recorded yet for this employee.
                  </p>
                )}

                {selectedUser && weeklyHours.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Week starting</th>
                          <th className="pb-2 text-right">Hours worked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeklyHours.map((entry) => (
                          <tr
                            key={entry.id}
                            className="border-b border-gray-50"
                          >
                            <td className="py-2.5 pr-4 text-gray-900">
                              {new Date(entry.weekStartDate).toLocaleDateString(
                                "en-GB",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </td>
                            <td className="py-2.5 text-right font-mono text-gray-600">
                              {entry.hoursWorked}h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-gray-400">
                      Showing up to 52 most recent weeks. Average:{" "}
                      <strong>
                        {(
                          weeklyHours.reduce((s, e) => s + e.hoursWorked, 0) /
                          weeklyHours.length
                        ).toFixed(1)}
                        h/week
                      </strong>{" "}
                      &rarr; FTE ratio:{" "}
                      <strong>
                        {Math.min(
                          1,
                          weeklyHours.reduce((s, e) => s + e.hoursWorked, 0) /
                            weeklyHours.length /
                            37.5
                        ).toFixed(3)}
                      </strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Holiday usage */}
          {activeTab === "holiday-usage" && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Holiday usage</CardTitle>
                    <CardDescription>
                      Annual leave days taken per UK employee this year.
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="mt-2 text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportCsv("holiday-usage")}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(report?.holidayUsage.length ?? 0) === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No holiday usage data.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4">Department</th>
                          <th className="pb-2 pr-4">Contract</th>
                          <th className="pb-2 text-right">Days taken</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report!.holidayUsage.map((row) => (
                          <tr
                            key={row.userId}
                            className="border-b border-gray-50"
                          >
                            <td className="py-2.5 pr-4 font-medium text-gray-900">
                              {row.name}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {row.department ?? "—"}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {row.contractType.replace("_", " ").toLowerCase()}
                            </td>
                            <td className="py-2.5 text-right font-mono font-medium">
                              {row.taken}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* SSP liability */}
          {activeTab === "ssp" && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>SSP liability</CardTitle>
                    <CardDescription>
                      Employees currently on Statutory Sick Pay with estimated
                      costs.
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="mt-2 text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportCsv("ssp")}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(report?.sspLiability.length ?? 0) === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No employees currently on SSP.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4">Start date</th>
                          <th className="pb-2 pr-4 text-right">
                            Days elapsed
                          </th>
                          <th className="pb-2 text-right">Estimated cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report!.sspLiability.map((row) => (
                          <tr
                            key={row.userId + row.startDate}
                            className="border-b border-gray-50"
                          >
                            <td className="py-2.5 pr-4 font-medium text-gray-900">
                              {row.name}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {new Date(row.startDate).toLocaleDateString(
                                "en-GB"
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-right text-gray-600">
                              {row.daysElapsed}
                            </td>
                            <td className="py-2.5 text-right font-mono font-medium">
                              &pound;{row.estimatedCostToDate.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Parental leave tracker */}
          {activeTab === "parental" && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Parental leave tracker</CardTitle>
                    <CardDescription>
                      Active statutory parental leave with KIT (Keeping In
                      Touch) day usage. Click a KIT cell to edit.
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="mt-2 text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportCsv("parental")}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(report?.parentalTracker.length ?? 0) === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No active parental leave cases.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4">Leave type</th>
                          <th className="pb-2 pr-4">Expected return</th>
                          <th className="pb-2 text-right">KIT used</th>
                          <th className="pb-2 text-right">KIT remaining</th>
                          <th className="pb-2 text-right">KIT cap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report!.parentalTracker.map((row) => (
                          <tr
                            key={row.requestId}
                            className="border-b border-gray-50"
                          >
                            <td className="py-2.5 pr-4 font-medium text-gray-900">
                              {row.name}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {row.leaveType}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {new Date(
                                row.expectedReturnDate
                              ).toLocaleDateString("en-GB")}
                            </td>
                            <td className="py-2.5 pr-4 text-right">
                              <input
                                type="number"
                                min="0"
                                max={row.kitDaysCap}
                                defaultValue={row.kitDaysUsed}
                                onBlur={async (e) => {
                                  const next = parseInt(e.target.value, 10);
                                  if (
                                    isNaN(next) ||
                                    next === row.kitDaysUsed ||
                                    next < 0 ||
                                    next > row.kitDaysCap
                                  )
                                    return;
                                  const res = await fetch(
                                    `/api/leave-requests/${row.requestId}`,
                                    {
                                      method: "PATCH",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        kitDaysUsed: next,
                                      }),
                                    }
                                  );
                                  if (res.ok) {
                                    toast("KIT days updated", "success");
                                    fetchReport();
                                  } else {
                                    toast("Failed to update", "error");
                                  }
                                }}
                                className="w-16 rounded border border-gray-200 px-2 py-1 text-right font-mono text-sm focus:border-brand-500 focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono">
                              {row.kitDaysRemaining}
                            </td>
                            <td className="py-2.5 text-right font-mono text-gray-500">
                              {row.kitDaysCap}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Analytics dashboard */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              {!analytics ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-gray-400">
                    Loading analytics...
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardContent className="py-4">
                        <p className="text-xs text-gray-500">
                          Total absence days ({analytics.year})
                        </p>
                        <p className="mt-1 text-2xl font-bold">
                          {analytics.totalDays}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4">
                        <p className="text-xs text-gray-500">
                          Avg per employee
                        </p>
                        <p className="mt-1 text-2xl font-bold">
                          {analytics.avgDaysPerEmployee}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4">
                        <p className="text-xs text-gray-500">
                          Previous year ({analytics.year - 1})
                        </p>
                        <p className="mt-1 text-2xl font-bold">
                          {analytics.yearOverYear.previousYearDays}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4">
                        <p className="text-xs text-gray-500">
                          Year-on-year change
                        </p>
                        <p
                          className={`mt-1 text-2xl font-bold ${
                            analytics.yearOverYear.changeDays > 0
                              ? "text-red-600"
                              : analytics.yearOverYear.changeDays < 0
                                ? "text-green-600"
                                : "text-gray-900"
                          }`}
                        >
                          {analytics.yearOverYear.changeDays > 0 ? "+" : ""}
                          {analytics.yearOverYear.changeDays}{" "}
                          {analytics.yearOverYear.changePercent !== null && (
                            <span className="text-sm font-normal text-gray-500">
                              (
                              {analytics.yearOverYear.changePercent > 0
                                ? "+"
                                : ""}
                              {analytics.yearOverYear.changePercent}%)
                            </span>
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-brand-500" />
                        Monthly absence trend
                      </CardTitle>
                      <CardDescription>
                        Approved leave weekdays per month, {analytics.year}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const max = Math.max(
                          1,
                          ...analytics.monthlyTrend.map((m) => m.days)
                        );
                        return (
                          <div className="flex h-48 items-end gap-2">
                            {analytics.monthlyTrend.map((m) => (
                              <div
                                key={m.month}
                                className="flex flex-1 flex-col items-center gap-1"
                              >
                                <div className="text-xs font-medium text-gray-600">
                                  {m.days || ""}
                                </div>
                                <div className="flex w-full flex-1 items-end">
                                  <div
                                    className="w-full rounded-t bg-brand-500 transition-all"
                                    style={{
                                      height: `${(m.days / max) * 100}%`,
                                      minHeight: m.days > 0 ? "4px" : "0",
                                    }}
                                  />
                                </div>
                                <div className="text-[10px] uppercase text-gray-500">
                                  {m.month}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Leave type breakdown</CardTitle>
                        <CardDescription>
                          Days taken per leave type
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {analytics.leaveTypeBreakdown.length === 0 ? (
                          <p className="py-4 text-center text-sm text-gray-400">
                            No data
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {(() => {
                              const max = Math.max(
                                1,
                                ...analytics.leaveTypeBreakdown.map(
                                  (l) => l.days
                                )
                              );
                              return analytics.leaveTypeBreakdown.map((lt) => (
                                <div key={lt.name}>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-gray-700">
                                      {lt.name}
                                    </span>
                                    <span className="font-mono text-gray-500">
                                      {lt.days}
                                    </span>
                                  </div>
                                  <div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-100">
                                    <div
                                      className="h-full"
                                      style={{
                                        width: `${(lt.days / max) * 100}%`,
                                        backgroundColor: lt.color,
                                      }}
                                    />
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Department breakdown</CardTitle>
                        <CardDescription>Absence days by department</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {analytics.departmentBreakdown.length === 0 ? (
                          <p className="py-4 text-center text-sm text-gray-400">
                            No data
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {(() => {
                              const max = Math.max(
                                1,
                                ...analytics.departmentBreakdown.map(
                                  (d) => d.days
                                )
                              );
                              return analytics.departmentBreakdown.map((d) => (
                                <div key={d.department}>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-gray-700">
                                      {d.department}
                                    </span>
                                    <span className="font-mono text-gray-500">
                                      {d.days}
                                    </span>
                                  </div>
                                  <div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-100">
                                    <div
                                      className="h-full bg-brand-500"
                                      style={{
                                        width: `${(d.days / max) * 100}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {analytics.topAbsenceUsers.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Top 10 absence days</CardTitle>
                        <CardDescription>
                          Employees with the most leave taken this year
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {(() => {
                            const max = Math.max(
                              1,
                              ...analytics.topAbsenceUsers.map((u) => u.days)
                            );
                            return analytics.topAbsenceUsers.map((u, i) => (
                              <div key={i}>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-gray-700">
                                    {u.name}
                                  </span>
                                  <span className="font-mono text-gray-500">
                                    {u.days}
                                  </span>
                                </div>
                                <div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-100">
                                  <div
                                    className="h-full bg-orange-400"
                                    style={{ width: `${(u.days / max) * 100}%` }}
                                  />
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {/* Payroll export */}
          {activeTab === "payroll" && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Payroll export</CardTitle>
                    <CardDescription>
                      Approved leave in a date range with the legally
                      compliant daily holiday pay rate (52-week average of
                      gross earnings, zero-pay weeks excluded) multiplied
                      by days taken. Rows show{" "}
                      <code>captured_at_booking</code> when the rate was
                      stored on the leave request or{" "}
                      <code>recalculated</code> when computed now for
                      annual leave requests lacking a stored rate.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !payrollReport || payrollReport.rows.length === 0
                    }
                    onClick={exportPayrollCsv}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    id="payrollFrom"
                    label="From"
                    type="date"
                    value={payrollFrom}
                    onChange={(e) => setPayrollFrom(e.target.value)}
                    className="w-44"
                  />
                  <Input
                    id="payrollTo"
                    label="To"
                    type="date"
                    value={payrollTo}
                    onChange={(e) => setPayrollTo(e.target.value)}
                    className="w-44"
                  />
                  <Button
                    size="sm"
                    onClick={fetchPayroll}
                    disabled={payrollLoading}
                  >
                    {payrollLoading ? "Loading..." : "Refresh"}
                  </Button>
                </div>

                {payrollReport && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Rows</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {payrollReport.totals.rowCount}
                      </p>
                    </div>
                    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Total days</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {payrollReport.totals.totalDays}
                      </p>
                    </div>
                    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">
                        Estimated pay (£)
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {payrollReport.totals.totalEstimatedPay.toLocaleString(
                          "en-GB",
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {payrollLoading ? (
                  <TableSkeleton rows={5} />
                ) : payrollReport && payrollReport.rows.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No approved leave in this range.
                  </p>
                ) : payrollReport ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4">Leave type</th>
                          <th className="pb-2 pr-4">Dates</th>
                          <th className="pb-2 pr-4 text-right">Days</th>
                          <th className="pb-2 pr-4 text-right">Daily rate</th>
                          <th className="pb-2 pr-4 text-right">Est. pay</th>
                          <th className="pb-2">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollReport.rows.map((row) => (
                          <tr
                            key={row.leaveRequestId}
                            className="border-b border-gray-50"
                          >
                            <td className="py-2 pr-4">
                              <div className="font-medium text-gray-900">
                                {row.name}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                {row.email}
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-gray-700">
                              {row.leaveType}
                              {!row.isPaid && (
                                <span className="ml-1 text-[10px] text-gray-500">
                                  (unpaid)
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-xs text-gray-600">
                              {new Date(row.startDate).toLocaleDateString(
                                "en-GB"
                              )}{" "}
                              –{" "}
                              {new Date(row.endDate).toLocaleDateString(
                                "en-GB"
                              )}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-700">
                              {row.daysTaken}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-700">
                              {row.dailyHolidayPayRate == null
                                ? "—"
                                : `£${row.dailyHolidayPayRate.toFixed(2)}`}
                            </td>
                            <td className="py-2 pr-4 text-right font-medium text-gray-900">
                              {row.estimatedPay == null
                                ? "—"
                                : `£${row.estimatedPay.toFixed(2)}`}
                            </td>
                            <td className="py-2">
                              <Badge
                                variant="outline"
                                className="font-mono text-[10px]"
                              >
                                {row.rateSource ?? "not_applicable"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Year-end rollover (admin) */}
          {activeTab === "year-end" && isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-brand-500" />
                  Year-end carry-over rollover
                </CardTitle>
                <CardDescription>
                  Process the end of a UK leave year. For each UK employee,
                  unused Annual Leave (capped by your carry-over max) is
                  carried into the next year and expires on the date configured
                  in Settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    id="rolloverYear"
                    label="Year ending"
                    type="number"
                    min="2020"
                    max="2100"
                    value={String(rolloverYear)}
                    onChange={(e) =>
                      setRolloverYear(parseInt(e.target.value || "0", 10))
                    }
                    className="w-32"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rolloverProcessing}
                    onClick={() => runRollover(true)}
                  >
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    disabled={rolloverProcessing}
                    onClick={() => runRollover(false)}
                  >
                    {rolloverProcessing ? "Processing..." : "Run rollover"}
                  </Button>
                </div>

                {rolloverPreview && rolloverPreview.length === 0 && (
                  <p className="text-sm text-gray-500">
                    No employees have unused leave eligible for carry-over.
                  </p>
                )}

                {rolloverPreview && rolloverPreview.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4">Email</th>
                          <th className="pb-2 pr-4 text-right">Unused</th>
                          <th className="pb-2 text-right">Carried</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rolloverPreview.map((row) => (
                          <tr
                            key={row.userId}
                            className="border-b border-gray-50"
                          >
                            <td className="py-2.5 pr-4 font-medium text-gray-900">
                              {row.name}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {row.email}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono text-gray-600">
                              {row.unusedDays}
                            </td>
                            <td className="py-2.5 text-right font-mono font-medium">
                              {row.daysCarried}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Add weekly hours dialog */}
      <Dialog
        open={showAddHours}
        onClose={() => setShowAddHours(false)}
        title="Record weekly hours"
      >
        <form onSubmit={handleAddHours} className="space-y-4">
          <Input
            id="weekDate"
            label="Week starting (Monday)"
            type="date"
            value={newWeekDate}
            onChange={(e) => setNewWeekDate(e.target.value)}
            required
          />
          <Input
            id="hoursWorked"
            label="Hours worked"
            type="number"
            min="0"
            max="168"
            step="0.5"
            value={newHours}
            onChange={(e) => setNewHours(e.target.value)}
            required
          />
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={savingHours}>
              {savingHours ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddHours(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

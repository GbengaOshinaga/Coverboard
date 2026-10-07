"use client";

import { formatGBP } from "@/lib/money";
import { leaveYearBounds, leaveYearLabel } from "@/lib/leave-year";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CoverShiftsSection } from "@/components/reports/cover-shifts-section";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardHeaderIntro,
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
import type { PayrollReport } from "@/lib/payroll-columns";
import type { Fte } from "@/lib/fte";
import { WorkingTimeSection } from "@/components/reports/working-time-section";
import { rightToWorkAtRisk } from "@/lib/right-to-work";
import { CARRY_OVER_REASON_LABEL, type CarryOverReason } from "@/lib/carry-over";
import {
  peopleOnSspToday,
  sspStarted,
  type UkComplianceReport,
  type UkComplianceTableId,
} from "@/lib/uk-compliance-columns";
import { AbsenceTrendsSection } from "@/components/reports/absence-trends-section";
import { RegionalCoverSection } from "@/components/reports/regional-cover-section";
import { LeaveOperationsSection } from "@/components/reports/leave-operations-section";
import {
  formatEmploymentType,
  isHoursAveragedEmploymentType,
} from "@/lib/employment-types";

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
  /** Calculated by the API from logged hours (src/lib/fte.ts). */
  fte?: Fte;
};

type UKReport = UkComplianceReport;

const fmtLeaveYear = (y: UkComplianceReport["leaveYear"]) => {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${y.label}, ${f(y.start)} – ${f(y.end)}`;
};

const REPORT_TABS = [
  "operations",
  "analytics",
  "bradford",
  "absence-trends",
  "regional-cover",
  "right-to-work",
  "weekly-hours",
  "working-time",
  "holiday-usage",
  "ssp",
  "parental",
  "payroll",
  "year-end",
] as const;

type ActiveTab = (typeof REPORT_TABS)[number];

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
  unit: "days" | "hours";
  sicknessDays: number;
  familyLeaveDays: number;
  statutoryExcluded: boolean;
  rows: Array<{
    reason: CarryOverReason;
    carried: number;
    expiresAt: string;
    source: "brought_forward" | "this_year";
  }>;
};

/** Monday (YYYY-MM-DD) of the week containing a YYYY-MM-DD date. */
function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { data: session } = useSession();

  // Plan/role flags are derived from the session and used both to choose the
  // initial tab below and to filter the visible tab list later. Declared
  // here (above any useState) so the lazy-initializer for activeTab can
  // read them without hitting the temporal dead zone.
  const user = session?.user as Record<string, unknown> | undefined;
  const userRole = user?.role as string | undefined;
  const isAdmin = userRole === "ADMIN";
  const userPlan = user?.plan as string | undefined;
  // Absence trends + scheduled compliance reports are Scale-tier features.
  // Trial inherits Pro-bundle access so the tab is visible during the
  // 14-day trial too.
  const hasAbsenceAnalytics =
    userPlan === "SCALE" || userPlan === "PRO" || userPlan === "TRIAL";

  const [report, setReport] = useState<UKReport | null>(null);
  const [hasUkWorkforce, setHasUkWorkforce] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  // Land on Operations when the user's plan unlocks it (Scale+); fall back
  // to Analytics for lower tiers where Operations is filtered out.
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    hasAbsenceAnalytics ? "operations" : "analytics"
  );
  const [threshold, setThreshold] = useState(200);

  // Links from emails open a tab directly, e.g. /reports?tab=right-to-work.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && (REPORT_TABS as readonly string[]).includes(tab)) setActiveTab(tab as ActiveTab);
  }, []);

  const [variableUsers, setVariableUsers] = useState<VariableHoursUser[]>([]);
  // Accepted cover hours per week (Monday YYYY-MM-DD) for the selected person.
  // Shown beside logged hours, never added automatically: logged hours usually
  // come from timesheets that already include the cover shift.
  const [coverHoursByWeek, setCoverHoursByWeek] = useState<Map<string, number>>(new Map());
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

  // The leave year end to process: the one just ended until halfway through
  // the next, then the one coming up. Set from the team's leave year once the
  // report loads (src/lib/leave-year.ts rolloverLeaveYear).
  const [rolloverYear, setRolloverYear] = useState(() => {
    const now = new Date();
    return now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
  });
  const rolloverYearTouched = useRef(false);
  const [rolloverPreview, setRolloverPreview] = useState<
    RolloverPreviewRow[] | null
  >(null);
  const [rolloverProcessing, setRolloverProcessing] = useState(false);
  // People whose sickness or family leave didn't stop them taking holiday.
  const [rolloverExcluded, setRolloverExcluded] = useState<Set<string>>(new Set());

  const { toast } = useToast();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/uk-compliance?bradfordThreshold=${threshold}`
      );
      if (res.ok) {
        setHasUkWorkforce(true);
        const data: UKReport = await res.json();
        setReport(data);
        if (!rolloverYearTouched.current) setRolloverYear(data.leaveYear.rolloverYear);
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
    void fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    if (
      !hasUkWorkforce &&
      ["bradford", "right-to-work", "holiday-usage", "ssp", "parental", "year-end"].includes(
        activeTab
      )
    ) {
      setActiveTab(hasAbsenceAnalytics ? "operations" : "analytics");
    }
  }, [hasUkWorkforce, hasAbsenceAnalytics, activeTab]);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch("/api/reports/analytics");
        if (res.ok) setAnalytics(await res.json());
      } catch {
        // ignore
      }
    }
    void fetchAnalytics();
  }, []);

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
    if (activeTab === "payroll" && !payrollReport) {
      fetchPayroll();
    }
  }, [activeTab, payrollReport, fetchPayroll]);

  // The file comes from the API, which owns the columns (payroll-columns.ts),
  // so the download always matches the server's rows.
  // Uses the loaded report's dates, so the file matches the table on screen
  // even if the date inputs were changed without pressing Refresh.
  function payrollExportHref(report: PayrollReport, format: "csv" | "excel") {
    const qs = new URLSearchParams({
      format,
      from: report.from.slice(0, 10),
      to: report.to.slice(0, 10),
    });
    return `/api/reports/payroll?${qs.toString()}`;
  }

  async function runRollover(dryRun: boolean) {
    setRolloverProcessing(true);
    try {
      const res = await fetch("/api/carry-over/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromYear: rolloverYear,
          dryRun,
          excludeStatutory: [...rolloverExcluded],
        }),
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

  // Each tab's CSV comes from the API, which owns the columns
  // (uk-compliance-columns.ts), using the threshold of the report on screen.
  function complianceCsvHref(table: UkComplianceTableId) {
    const qs = new URLSearchParams({
      format: "csv",
      table,
      bradfordThreshold: String(report?.absenceTrigger.threshold ?? threshold),
    });
    return `/api/reports/uk-compliance?${qs.toString()}`;
  }

  const [packExporting, setPackExporting] = useState(false);

  // One Excel workbook with a sheet per report. Browsers block a burst of
  // separate downloads, so five CSVs on timers never reliably arrived.
  async function exportFullPack() {
    setPackExporting(true);
    try {
      const res = await fetch(
        `/api/reports/uk-compliance?format=excel&bradfordThreshold=${threshold}`
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `coverboard-uk-compliance-pack-${date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast("Compliance pack downloaded (Excel, one sheet per report)", "success");
    } catch {
      toast("Couldn't export the compliance pack. Please try again.", "error");
    } finally {
      setPackExporting(false);
    }
  }

  const fetchVariableUsers = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void fetchVariableUsers();
  }, [fetchVariableUsers]);

  useEffect(() => {
    async function loadHours() {
      if (!selectedUser) {
        setWeeklyHours([]);
        setCoverHoursByWeek(new Map());
        return;
      }
      try {
        const from = new Date(Date.now() - 371 * 86400_000).toISOString().slice(0, 10);
        const to = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
        const [res, coverRes] = await Promise.all([
          fetch(`/api/weekly-hours?userId=${selectedUser}`),
          fetch(`/api/cover-shifts?userId=${selectedUser}&from=${from}&to=${to}`),
        ]);
        if (res.ok) setWeeklyHours(await res.json());
        const shifts: Array<{ date: string; hours: number }> = coverRes.ok ? await coverRes.json() : [];
        const byWeek = new Map<string, number>();
        for (const s of shifts) {
          const key = mondayOf(s.date);
          byWeek.set(key, (byWeek.get(key) ?? 0) + s.hours);
        }
        setCoverHoursByWeek(byWeek);
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
        // Their FTE is worked out from these hours; refresh it too.
        void fetchVariableUsers();
      } else {
        const err = await res.json();
        toast(err.error || "Failed to save hours", "error");
      }
    } catch {
      toast("Failed to save hours", "error");
    }
    setSavingHours(false);
  }

  const tabs = useMemo(() => {
    const reviewerTabs: {
      id: ActiveTab;
      label: string;
      adminOnly?: boolean;
      requiresUk?: boolean;
      requiresAnalytics?: boolean;
    }[] = [
      { id: "operations", label: "Operations", requiresAnalytics: true },
      { id: "analytics", label: "Analytics" },
      { id: "bradford", label: "Bradford Factor", requiresUk: true },
      {
        id: "absence-trends",
        label: "Absence trends",
        requiresUk: true,
        requiresAnalytics: true,
      },
      {
        id: "regional-cover",
        label: "Cover by location",
        requiresAnalytics: true,
      },
      { id: "right-to-work", label: "Right to work", requiresUk: true },
      { id: "weekly-hours", label: "Weekly hours" },
      { id: "working-time", label: "Working time", requiresUk: true },
      { id: "holiday-usage", label: "Holiday usage", requiresUk: true },
      { id: "ssp", label: "SSP liability", requiresUk: true },
      { id: "parental", label: "Parental leave", requiresUk: true },
      { id: "payroll", label: "Payroll export" },
      {
        id: "year-end",
        label: "Year-end rollover",
        adminOnly: true,
        requiresUk: true,
      },
    ];
    return reviewerTabs.filter(
      (t) =>
        (!t.adminOnly || isAdmin) &&
        (!t.requiresUk || hasUkWorkforce) &&
        (!t.requiresAnalytics || hasAbsenceAnalytics)
    );
  }, [isAdmin, hasUkWorkforce, hasAbsenceAnalytics]);

  useEffect(() => {
    const ids = tabs.map((t) => t.id);
    if (!ids.length) return;
    if (!ids.includes(activeTab)) {
      setActiveTab(ids[0]!);
    }
  }, [tabs, activeTab]);

  const ukOnlyNote =
    report?.workforce && report.workforce.total > 0
      ? `Showing results for UK-based employees only (${report.workforce.uk} of ${report.workforce.total} employees)`
      : null;

  const bradfordRows = report?.absenceTrigger.rows ?? [];
  const sortedBradford = [...bradfordRows].sort((a, b) => b.score - a.score);
  const flaggedCount = bradfordRows.filter((r) => r.flagged).length;

  const rtwRows = report?.rightToWork ?? [];
  // No valid check on record: not checked, failed, or permission expired.
  const rtwUnverified = rtwRows.filter((r) => rightToWorkAtRisk(r.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            Reports
          </h1>
          <p className="text-sm leading-relaxed text-gray-500">
            Workforce analytics
            {hasUkWorkforce
              ? " and UK compliance reporting"
              : " (UK compliance reports appear automatically when you add UK-based employees)"}
          </p>
        </div>
        {hasUkWorkforce && (
          <Button
            size="sm"
            variant="outline"
            onClick={exportFullPack}
            disabled={packExporting}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {packExporting ? "Preparing…" : "Export compliance pack"}
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
                    {peopleOnSspToday(report.sspLiability)}
                  </p>
                  <p className="text-xs text-gray-500">On SSP today</p>
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

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Bradford Factor */}
          {activeTab === "bradford" && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <CardHeaderIntro>
                    <CardTitle>Bradford Factor scores</CardTitle>
                    <CardDescription>
                      S&sup2; &times; D — higher scores indicate frequent
                      short-term absences. The formula uses sickness spells (S)
                      and total sick days (D) over the last 12 months.
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </CardHeaderIntro>
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
                    <a
                      href={complianceCsvHref("bradford")}
                      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-gray-300 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      CSV
                    </a>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sortedBradford.length > 0 && (
                  <div
                    className={`mb-4 rounded-lg border p-3 text-sm ${
                      flaggedCount > 0
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-green-200 bg-green-50 text-green-900"
                    }`}
                  >
                    {flaggedCount > 0 ? (
                      <>
                        <span className="font-medium">
                          {flaggedCount}{" "}
                          {flaggedCount === 1 ? "person is" : "people are"} above
                          your threshold of {threshold}.
                        </span>{" "}
                        A high score usually points to a pattern of frequent
                        short absences rather than one long illness. Most
                        managers find it helpful to have a supportive, informal
                        return-to-work chat at this point — not a disciplinary
                        one. Open someone&apos;s profile to see the breakdown
                        before the conversation.
                      </>
                    ) : (
                      <>
                        <span className="font-medium">
                          Nobody is above your threshold of {threshold}.
                        </span>{" "}
                        Your team&apos;s short-term absence is in a healthy range
                        — nothing needs your attention right now.
                      </>
                    )}
                  </div>
                )}
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

          {/* Leave operations dashboard (Scale+) */}
          {activeTab === "operations" && <LeaveOperationsSection />}

          {/* Absence trends (Scale+) */}
          {activeTab === "absence-trends" && <AbsenceTrendsSection />}

          {/* Regional cover (Scale+) */}
          {activeTab === "regional-cover" && <RegionalCoverSection />}

          {/* Working time: 48-hour average, opt-outs, rest */}
          {activeTab === "working-time" && <WorkingTimeSection />}

          {/* Right to work */}
          {activeTab === "right-to-work" && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardHeaderIntro>
                    <CardTitle>Right to work verification</CardTitle>
                    <CardDescription>
                      Every UK employee&apos;s latest check. Time-limited
                      permission has to be checked again before it expires;
                      rechecks due within 60 days are flagged. Record checks
                      on each person&apos;s profile.
                      {rtwRows.some(
                        (r) => r.employmentType === "ZERO_HOURS" && rightToWorkAtRisk(r.status)
                      )
                        ? " Right to work verification is especially important for zero-hours and bank staff."
                        : ""}
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </CardHeaderIntro>
                  <a
                    href={complianceCsvHref("right-to-work")}
                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-gray-300 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </a>
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
                          <th className="pb-2 pr-4">Last checked</th>
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
                              {row.checkedOn
                                ? new Date(`${row.checkedOn}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" })
                                : "—"}
                            </td>
                            <td className="py-2.5">
                              <Badge
                                variant={
                                  row.status === "checked"
                                    ? "success"
                                    : row.status === "recheck_due"
                                      ? "warning"
                                      : row.status === "not_checked"
                                        ? "outline"
                                        : "error"
                                }
                              >
                                {row.statusLabel}
                              </Badge>
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
                  <CardHeaderIntro>
                    <CardTitle>Variable and zero-hours tracking</CardTitle>
                    <CardDescription>
                      Record weekly hours for variable-hours and zero-hours
                      employees. The last 52 weeks are used to calculate their
                      FTE ratio and pro-rated annual leave entitlement.
                    </CardDescription>
                  </CardHeaderIntro>
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

                {selectedUser && (() => {
                  const logged = new Set(weeklyHours.map((e) => e.weekStartDate.slice(0, 10)));
                  const missing = [...coverHoursByWeek.entries()]
                    .filter(([week]) => !logged.has(week))
                    .sort(([a], [b]) => a.localeCompare(b));
                  if (missing.length === 0) return null;
                  return (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Accepted cover in weeks with no hours logged yet:{" "}
                      {missing
                        .map(([week, h]) => `w/c ${new Date(`${week}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} (${h}h)`)
                        .join(", ")}
                      . Holiday accrues on logged hours, so record those weeks.
                    </div>
                  );
                })()}

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
                          <th className="pb-2 pr-4 text-right">Accepted cover</th>
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
                            <td className="py-2.5 pr-4 text-right font-mono text-emerald-700">
                              {coverHoursByWeek.get(entry.weekStartDate.slice(0, 10))
                                ? `${coverHoursByWeek.get(entry.weekStartDate.slice(0, 10))}h`
                                : "—"}
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
                      &rarr; FTE:{" "}
                      <strong>
                        {variableUsers.find((u) => u.id === selectedUser)?.fte?.value ?? "—"}
                      </strong>{" "}
                      (shown on their profile too)
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
                  <CardHeaderIntro>
                    <CardTitle>Holiday usage</CardTitle>
                    <CardDescription>
                      Annual leave days taken per UK employee this leave year
                      {report ? ` (${fmtLeaveYear(report.leaveYear)})` : ""}.
                      Holiday records are kept for at least 6 years, including
                      for people who&apos;ve left; the payroll export covers any
                      dates you need.
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </CardHeaderIntro>
                  <a
                    href={complianceCsvHref("holiday-usage")}
                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-gray-300 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </a>
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
                          <th className="pb-2 text-right">Taken (YTD)</th>
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
                              {row.unit === "hours"
                                ? `${row.taken} hrs`
                                : row.taken}
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
                  <CardHeaderIntro>
                    <CardTitle>SSP liability</CardTitle>
                    <CardDescription>
                      Current and upcoming Statutory Sick Pay absences with
                      estimated costs. Past absences aren&apos;t listed, but
                      still count towards days left when they link (8 weeks or
                      less between absences).
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </CardHeaderIntro>
                  <a
                    href={complianceCsvHref("ssp")}
                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-gray-300 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </a>
                </div>
              </CardHeader>
              <CardContent>
                {(report?.sspLiability.length ?? 0) === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No current or upcoming SSP absences.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4">Dates</th>
                          <th className="pb-2 pr-4 text-right">SSP days</th>
                          <th className="pb-2 pr-4 text-right">Daily rate</th>
                          <th className="pb-2 pr-4 text-right">Cost to date</th>
                          <th className="pb-2 pr-4 text-right">Whole absence</th>
                          <th
                            className="pb-2 text-right"
                            title="SSP days left in the 28-week limit, counting earlier linked absences"
                          >
                            Days left
                          </th>
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
                              {new Date(row.startDate).toLocaleDateString("en-GB")}
                              {" – "}
                              {new Date(row.endDate).toLocaleDateString("en-GB")}
                              {!sspStarted(row) && (
                                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                  Upcoming
                                </span>
                              )}
                            </td>
                            <td
                              className="py-2.5 pr-4 text-right text-gray-600"
                              title={`Counted on the ${row.qualifyingDaysPerWeek} days a week they work`}
                            >
                              {row.sspDaysPaid}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono text-gray-600">
                              <span title={row.rateBasis}>{formatGBP(row.dailyRate)}</span>
                              {(row.averageWeeklyEarnings === null || row.dailyRate === 0) && (
                                <span className="block max-w-56 text-[11px] font-sans text-amber-700">
                                  {row.rateBasis}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono text-gray-600">
                              {formatGBP(row.estimatedCostToDate)}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono font-medium">
                              {formatGBP(row.estimatedTotalCost)}
                            </td>
                            <td
                              className="py-2.5 text-right font-mono text-gray-600"
                              title={`Of ${row.maxDays} (28 weeks of the ${row.qualifyingDaysPerWeek} days a week they work)`}
                            >
                              {row.remainingDays}
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
                  <CardHeaderIntro>
                    <CardTitle>Parental leave tracker</CardTitle>
                    <CardDescription>
                      Active statutory parental leave with KIT (Keeping In
                      Touch) day usage. Click a KIT cell to edit.
                    </CardDescription>
                    {ukOnlyNote && (
                      <p className="text-xs text-gray-500">{ukOnlyNote}</p>
                    )}
                  </CardHeaderIntro>
                  <a
                    href={complianceCsvHref("parental")}
                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-gray-300 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </a>
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
                          <th className="pb-2 pr-4 text-right">Leave</th>
                          <th className="pb-2 text-right">KIT/SPLIT used</th>
                          <th className="pb-2 text-right">Remaining</th>
                          <th className="pb-2 text-right">Allowed</th>
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
                              {row.shpp && (
                                <span className="block text-[11px] text-gray-500">
                                  {row.shpp.claimed
                                    ? row.shpp.weeklyRate !== null
                                      ? `ShPP ${formatGBP(row.shpp.weeklyRate)} a week`
                                      : "No ShPP (see the request)"
                                    : "Unpaid shared parental leave"}
                                </span>
                              )}
                              {row.smp && row.smp.phase1WeeklyRate !== null && (
                                <span className="block text-[11px] text-gray-500">
                                  {row.smp.kind} {formatGBP(row.smp.phase1WeeklyRate)} a week for 6 weeks, then{" "}
                                  {row.smp.phase2WeeklyRate !== null ? formatGBP(row.smp.phase2WeeklyRate) : "—"} · {row.smp.label}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {new Date(
                                row.expectedReturnDate
                              ).toLocaleDateString("en-GB")}
                            </td>
                            <td className="py-2.5 pr-4 text-right text-gray-600">
                              {row.leaveWeeks} week{row.leaveWeeks === 1 ? "" : "s"}
                              <span className="block text-[11px] text-gray-500">
                                {row.leaveDays} of their working days
                              </span>
                            </td>
                            {row.keepingInTouch ? (
                              <>
                                <td className="py-2.5 pr-4 text-right">
                                  <span className="mr-1.5 text-[10px] font-medium text-gray-500">
                                    {row.keepingInTouch.kind}
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={row.keepingInTouch.allowed}
                                    defaultValue={row.keepingInTouch.used}
                                    aria-label={`${row.keepingInTouch.kind} days used`}
                                    onBlur={async (e) => {
                                      const kit = row.keepingInTouch!;
                                      const next = parseInt(e.target.value, 10);
                                      if (
                                        isNaN(next) ||
                                        next === kit.used ||
                                        next < 0 ||
                                        next > kit.allowed
                                      )
                                        return;
                                      // KIT days and SPLIT days are stored separately.
                                      const field =
                                        kit.kind === "SPLIT" ? "splitDaysUsed" : "kitDaysUsed";
                                      const res = await fetch(
                                        `/api/leave-requests/${row.requestId}`,
                                        {
                                          method: "PATCH",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({ [field]: next }),
                                        }
                                      );
                                      if (res.ok) {
                                        toast(`${kit.kind} days updated`, "success");
                                        fetchReport();
                                      } else {
                                        const data = await res.json().catch(() => null);
                                        toast(data?.error ?? "Failed to update", "error");
                                      }
                                    }}
                                    className="w-16 rounded border border-gray-200 px-2 py-1 text-right font-mono text-sm focus:border-brand-500 focus:outline-none"
                                  />
                                </td>
                                <td className="py-2.5 pr-4 text-right font-mono">
                                  {row.keepingInTouch.remaining}
                                </td>
                                <td className="py-2.5 text-right font-mono text-gray-500">
                                  {row.keepingInTouch.allowed}
                                </td>
                              </>
                            ) : (
                              <td
                                colSpan={3}
                                className="py-2.5 text-right text-xs text-gray-400"
                              >
                                No KIT or SPLIT days for this leave
                              </td>
                            )}
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
                  <CardHeaderIntro>
                    <CardTitle>Payroll export</CardTitle>
                    <CardDescription>
                      Approved leave in a date range with the legally
                      compliant daily holiday pay rate (52-week average of
                      gross earnings, zero-pay weeks excluded) multiplied
                      by days taken. Rows show{" "}
                      <code>captured_at_booking</code> when the rate was
                      stored on the leave request or{" "}
                      <code>recalculated</code> when computed now for
                      annual leave requests lacking a stored rate. SSP
                      absences show the SSP days in these dates, the daily
                      rate and SSP pay; paternity leave shows Statutory
                      Paternity Pay (SPP).
                    </CardDescription>
                  </CardHeaderIntro>
                  {/* Only offered when there's leave in the period; an empty
                      period says so below instead of greyed-out buttons. */}
                  {payrollReport && payrollReport.rows.length > 0 && (
                    <div className="flex shrink-0 gap-2 text-sm">
                      {(["csv", "excel"] as const).map((f) => (
                        <a
                          key={f}
                          href={payrollExportHref(payrollReport, f)}
                          className="inline-flex items-center whitespace-nowrap rounded-md border border-gray-300 px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          {f === "csv" ? "CSV" : "Excel"}
                        </a>
                      ))}
                    </div>
                  )}
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                      <p className="text-xs text-gray-500">Total hours</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {payrollReport.totals.totalHours}
                      </p>
                    </div>
                    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">
                        Holiday pay (£)
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {payrollReport.totals.totalEstimatedPay.toLocaleString(
                          "en-GB",
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                        )}
                      </p>
                    </div>
                    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Statutory pay (£)</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {(
                          payrollReport.totals.totalSspPay +
                          payrollReport.totals.totalSppPay +
                          payrollReport.totals.totalShppPay +
                          payrollReport.totals.totalNeonatalPay +
                          payrollReport.totals.totalSmpPay +
                          payrollReport.totals.totalSapPay
                        ).toLocaleString("en-GB", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        SSP {formatGBP(payrollReport.totals.totalSspPay)} · SPP{" "}
                        {formatGBP(payrollReport.totals.totalSppPay)} · SMP{" "}
                        {formatGBP(payrollReport.totals.totalSmpPay)}
                        {payrollReport.totals.totalSapPay > 0 && <> · SAP {formatGBP(payrollReport.totals.totalSapPay)}</>}
                        {payrollReport.totals.totalShppPay > 0 && <> · ShPP {formatGBP(payrollReport.totals.totalShppPay)}</>}
                        {payrollReport.totals.totalNeonatalPay > 0 && <> · Neonatal {formatGBP(payrollReport.totals.totalNeonatalPay)}</>}
                      </p>
                    </div>
                  </div>
                )}

                {payrollLoading ? (
                  <TableSkeleton rows={5} />
                ) : payrollReport && payrollReport.rows.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No approved leave in these dates, so there&apos;s
                    nothing to export. Change the dates and press Refresh.
                  </p>
                ) : payrollReport ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="pb-2 pr-4">Employee</th>
                          <th className="pb-2 pr-4">Leave type</th>
                          <th className="pb-2 pr-4">Dates</th>
                          <th className="pb-2 pr-4 text-right" title="Days they'd have worked">Working days</th>
                          <th className="pb-2 pr-4 text-right">Calendar days</th>
                          <th className="pb-2 pr-4 text-right">Rate</th>
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
                              {row.hoursTaken != null
                                ? `${row.hoursTaken} hrs`
                                : row.daysTaken}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-500">{row.calendarDays}</td>
                            <td className="py-2 pr-4 text-right text-gray-700">
                              {row.smp
                                ? row.smp.weeklyRate == null
                                  ? "—"
                                  : `${formatGBP(row.smp.weeklyRate)}/wk ${row.smp.kind}`
                                : row.neonatal
                                ? row.neonatal.weeklyRate == null
                                  ? "—"
                                  : `${formatGBP(row.neonatal.weeklyRate)}/wk neonatal`
                                : row.shpp
                                ? row.shpp.weeklyRate == null
                                  ? row.shpp.pay === 0 ? "Unpaid" : "—"
                                  : `${formatGBP(row.shpp.weeklyRate)}/wk ShPP`
                                : row.spp
                                ? row.spp.weeklyRate == null
                                  ? "—"
                                  : `${formatGBP(row.spp.weeklyRate)}/wk SPP`
                                : row.ssp
                                ? row.ssp.dailyRate == null
                                  ? "—"
                                  : `${formatGBP(row.ssp.dailyRate)} SSP`
                                : row.hoursTaken != null
                                  ? row.hourlyRate == null
                                    ? "—"
                                    : `${formatGBP(row.hourlyRate)}/hr`
                                  : row.dailyHolidayPayRate == null
                                    ? "—"
                                    : formatGBP(row.dailyHolidayPayRate)}
                            </td>
                            <td className="py-2 pr-4 text-right font-medium text-gray-900">
                              {row.smp
                                ? row.smp.pay == null
                                  ? "—"
                                  : formatGBP(row.smp.pay)
                                : row.neonatal
                                ? row.neonatal.pay == null
                                  ? "—"
                                  : formatGBP(row.neonatal.pay)
                                : row.shpp
                                ? row.shpp.pay == null
                                  ? "—"
                                  : formatGBP(row.shpp.pay)
                                : row.spp
                                ? row.spp.pay == null
                                  ? "—"
                                  : formatGBP(row.spp.pay)
                                : row.ssp
                                ? row.ssp.pay == null
                                  ? "—"
                                  : formatGBP(row.ssp.pay)
                                : row.estimatedPay == null
                                  ? "—"
                                  : formatGBP(row.estimatedPay)}
                              {row.smp && (
                                <div className="max-w-56 text-[11px] font-normal text-gray-500">
                                  {row.smp.daysInPeriod} days of {row.smp.kind} · {row.smp.label}
                                </div>
                              )}
                              {row.neonatal && (
                                <div className="max-w-56 text-[11px] font-normal text-gray-500">
                                  {row.neonatal.weeklyRate == null
                                    ? row.neonatal.basis
                                    : `${row.neonatal.calendarDays} days of neonatal care pay`}
                                </div>
                              )}
                              {row.shpp && (
                                <div className="max-w-56 text-[11px] font-normal text-gray-500">
                                  {row.shpp.weeklyRate == null ? row.shpp.basis : `${row.shpp.calendarDays} days of ShPP`}
                                </div>
                              )}
                              {row.spp && (
                                <div className="max-w-56 text-[11px] font-normal text-gray-500">
                                  {row.spp.weeklyRate == null
                                    ? row.spp.basis
                                    : `${row.spp.calendarDays} days of SPP`}
                                </div>
                              )}
                              {row.ssp && (
                                <div className="max-w-56 text-[11px] font-normal text-gray-500">
                                  {row.ssp.daysInPeriod} SSP day{row.ssp.daysInPeriod === 1 ? "" : "s"}
                                  {row.ssp.averageWeeklyEarnings === null || row.ssp.dailyRate === 0
                                    ? ` · ${row.ssp.basis}`
                                    : ""}
                                </div>
                              )}
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

          {activeTab === "payroll" && (
            <CoverShiftsSection from={payrollFrom} to={payrollTo} />
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
                  Process the end of a UK leave year. Unused Annual Leave
                  carries into the next year:
                </CardDescription>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
                  <li>
                    <strong>After sickness</strong> — the untaken part of the
                    4 weeks (all untaken leave for irregular-hours staff), no
                    more than the days they were off, to use within 18 months
                    of the year end. Required by law.
                  </li>
                  <li>
                    <strong>After family leave</strong> (maternity, paternity,
                    adoption, shared parental, bereavement, neonatal) — all the
                    statutory leave they couldn&apos;t take, including the
                    extra 1.6 weeks (up to 28 days), into next year. Required by
                    law.
                  </li>
                  <li>
                    <strong>Company carry-over</strong> — from what&apos;s
                    left, up to your cap, expiring on the date set in
                    Settings.
                  </li>
                </ul>
                <p className="mt-1 text-xs text-gray-500">
                  The law covers leave people couldn&apos;t take because they
                  were off. Untick anyone whose absence didn&apos;t stop them
                  taking it, then preview again.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    id="rolloverYear"
                    label="Leave year starting"
                    type="number"
                    min="2020"
                    max="2100"
                    value={String(rolloverYear)}
                    onChange={(e) => {
                      rolloverYearTouched.current = true;
                      setRolloverYear(parseInt(e.target.value || "0", 10));
                    }}
                    className="w-32"
                  />
                  {report && rolloverYear > 2000 && (
                    <p className="pb-2 text-xs text-gray-500">
                      {(() => {
                        const [, m, d] = report.leaveYear.start.split("-").map(Number);
                        const start = { month: m, day: d };
                        const { start: from, end: to } = leaveYearBounds(rolloverYear, start);
                        const f = (x: Date) =>
                          x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
                        return `${leaveYearLabel(rolloverYear, start)}: ${f(from)} – ${f(to)}`;
                      })()}
                    </p>
                  )}
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
                          <th className="pb-2 pr-4 text-right">Unused</th>
                          <th className="pb-2 pr-4">Off sick / family leave</th>
                          <th className="pb-2 pr-4">Carries over</th>
                          <th className="pb-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rolloverPreview.map((row) => {
                          const unit = row.unit === "hours" ? "h" : " days";
                          const off = row.sicknessDays + row.familyLeaveDays > 0;
                          return (
                            <tr key={row.userId} className="border-b border-gray-50 align-top">
                              <td className="py-2.5 pr-4">
                                <div className="font-medium text-gray-900">{row.name}</div>
                                <div className="text-[11px] text-gray-500">{row.email}</div>
                              </td>
                              <td className="py-2.5 pr-4 text-right font-mono text-gray-600">
                                {row.unusedDays}
                                {unit}
                              </td>
                              <td className="py-2.5 pr-4 text-xs text-gray-600">
                                {off ? (
                                  <label className="flex items-start gap-1.5">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5"
                                      checked={!rolloverExcluded.has(row.userId)}
                                      onChange={(e) => {
                                        const next = new Set(rolloverExcluded);
                                        if (e.target.checked) next.delete(row.userId);
                                        else next.add(row.userId);
                                        setRolloverExcluded(next);
                                      }}
                                    />
                                    <span>
                                      {row.sicknessDays > 0 &&
                                        `${row.sicknessDays} day${row.sicknessDays === 1 ? "" : "s"} sick`}
                                      {row.sicknessDays > 0 && row.familyLeaveDays > 0 && " · "}
                                      {row.familyLeaveDays > 0 &&
                                        `${row.familyLeaveDays} day${row.familyLeaveDays === 1 ? "" : "s"} family leave`}
                                      <span className="block text-gray-400">
                                        Carry over what they couldn&apos;t take
                                      </span>
                                    </span>
                                  </label>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 text-xs text-gray-700">
                                {row.rows.length === 0 ? (
                                  <span className="text-gray-400">Nothing</span>
                                ) : (
                                  <ul className="space-y-0.5">
                                    {row.rows.map((r, k) => (
                                      <li key={k}>
                                        <span className="font-mono">
                                          {r.carried}
                                          {unit}
                                        </span>{" "}
                                        {CARRY_OVER_REASON_LABEL[r.reason]}
                                        {r.source === "brought_forward" ? " (brought forward)" : ""}
                                        <span
                                          className={
                                            new Date(r.expiresAt) < new Date() ? "text-red-700" : "text-gray-400"
                                          }
                                        >
                                          {" "}
                                          · until{" "}
                                          {new Date(r.expiresAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}
                                          {new Date(r.expiresAt) < new Date() ? " (already passed: check the year)" : ""}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                              <td className="py-2.5 text-right font-mono font-medium">
                                {row.daysCarried}
                                {unit}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {rolloverExcluded.size > 0 && (
                      <p className="mt-2 text-xs text-amber-700">
                        Changed who gets carry-over after an absence? Preview
                        again before running.
                      </p>
                    )}
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
          {newWeekDate && (coverHoursByWeek.get(mondayOf(newWeekDate)) ?? 0) > 0 && (
            <p className="text-xs text-emerald-800">
              They accepted {coverHoursByWeek.get(mondayOf(newWeekDate))}h of cover that week.
              Include it if your figure doesn&apos;t already.
            </p>
          )}
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

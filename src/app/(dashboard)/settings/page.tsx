"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Plus, MessageSquare, CheckCircle, XCircle, User, ChevronRight, SquareKanban, ExternalLink, Unlink, Pencil, Trash2, AlertTriangle, Banknote } from "lucide-react";
import { Select } from "@/components/ui/select";

/** Env vars and vendor-console setup are operator docs — only shown in the UI when running `next dev`. */
const SHOW_DEPLOYMENT_INTEGRATION_DOCS =
  process.env.NODE_ENV === "development";

type LeaveType = {
  id: string;
  name: string;
  color: string;
  isPaid: boolean;
  defaultDays: number;
};

type SlackStatus = {
  configured: boolean;
  connected: boolean;
  botName: string | null;
  teamName?: string | null;
  channel: string | null;
  error?: string;
};

type JiraStatus = {
  configured: boolean;
  connected: boolean;
  siteUrl: string | null;
  connectedBy: string | null;
};

type OrgSettings = {
  ukBankHolidayInclusive: boolean;
  ukBankHolidayRegion: "ENGLAND_WALES" | "SCOTLAND" | "NORTHERN_IRELAND";
  ukCarryOverEnabled: boolean;
  ukCarryOverMax: number;
  ukCarryOverExpiryMonth: number;
  ukCarryOverExpiryDay: number;
  dataResidency: "UK" | "EU" | "US";
  maxAdminUsers: number;
};

type LeavePolicy = {
  id: string;
  countryCode: string;
  annualAllowance: number;
  carryOverMax: number;
  leaveType: { id: string; name: string; color: string };
};

type EarningsCoverage = {
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

type UKComplianceReport = {
  holidayUsage: Array<{ name: string; taken: number; department: string | null; contractType: string }>;
  absenceTrigger: { threshold: number; rows: Array<{ name: string; score: number; flagged: boolean }> };
  sspLiability: Array<{ name: string; daysElapsed: number; estimatedCostToDate: number }>;
  parentalTracker: Array<{ name: string; leaveType: string; expectedReturnDate: string; kitDaysUsed: number; kitDaysCap: number }>;
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newDays, setNewDays] = useState("20");
  const [newIsPaid, setNewIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [jiraStatus, setJiraStatus] = useState<JiraStatus | null>(null);
  const [disconnectingJira, setDisconnectingJira] = useState(false);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [ukReport, setUkReport] = useState<UKComplianceReport | null>(null);

  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#6366f1");
  const [editDays, setEditDays] = useState("20");
  const [editIsPaid, setEditIsPaid] = useState(true);
  const [editSaving, setEditSaving] = useState(false);

  const [earningsCoverage, setEarningsCoverage] = useState<EarningsCoverage[] | null>(null);

  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [newPolicyType, setNewPolicyType] = useState("");
  const [newPolicyCountry, setNewPolicyCountry] = useState("GB");
  const [newPolicyAllowance, setNewPolicyAllowance] = useState("28");
  const [newPolicyCarryOver, setNewPolicyCarryOver] = useState("0");
  const [savingPolicy, setSavingPolicy] = useState(false);

  const { toast } = useToast();
  const user = session?.user as Record<string, unknown> | undefined;
  const userRole = user?.role as string | undefined;
  const orgName = user?.organizationName as string | undefined;
  const isAdmin = userRole === "ADMIN";

  const fetchLeaveTypes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leave-types");
    if (res.ok) {
      setLeaveTypes(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  // Check Slack integration status
  useEffect(() => {
    async function checkSlack() {
      try {
        const res = await fetch("/api/slack/status");
        if (res.ok) {
          setSlackStatus(await res.json());
        }
      } catch {
        // Silently fail
      }
    }
    checkSlack();
  }, []);

  useEffect(() => {
    async function fetchOrgSettings() {
      try {
        const res = await fetch("/api/organization/settings");
        if (res.ok) {
          setOrgSettings(await res.json());
        }
      } catch {
        // ignore
      }
    }
    fetchOrgSettings();
  }, []);

  useEffect(() => {
    async function fetchUkReport() {
      try {
        const res = await fetch("/api/reports/uk-compliance");
        if (res.ok) {
          setUkReport(await res.json());
        }
      } catch {
        // ignore
      }
    }
    fetchUkReport();
  }, []);

  useEffect(() => {
    async function fetchCoverage() {
      try {
        const res = await fetch("/api/weekly-earnings/coverage");
        if (res.ok) {
          const data = await res.json();
          setEarningsCoverage(data.employees);
        }
      } catch {
        // ignore
      }
    }
    if (userRole === "ADMIN" || userRole === "MANAGER") fetchCoverage();
  }, [userRole]);

  async function saveOrgSettings(next: Partial<OrgSettings>) {
    if (!orgSettings) return;
    const merged = { ...orgSettings, ...next };
    setOrgSettings(merged);
    const res = await fetch("/api/organization/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      toast("Failed to save settings", "error");
      return;
    }
    toast("Settings updated", "success");
  }

  useEffect(() => {
    async function checkJira() {
      try {
        const res = await fetch("/api/jira/status");
        if (res.ok) {
          setJiraStatus(await res.json());
        }
      } catch {
        // Silently fail
      }
    }
    checkJira();
  }, []);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch("/api/leave-policies");
      if (res.ok) setPolicies(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchPolicies();
  }, [isAdmin, fetchPolicies]);

  function openEditType(lt: LeaveType) {
    setEditingType(lt);
    setEditName(lt.name);
    setEditColor(lt.color);
    setEditDays(String(lt.defaultDays));
    setEditIsPaid(lt.isPaid);
  }

  async function handleEditLeaveType(e: React.FormEvent) {
    e.preventDefault();
    if (!editingType) return;
    setEditSaving(true);
    const res = await fetch(`/api/leave-types/${editingType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        color: editColor,
        isPaid: editIsPaid,
        defaultDays: parseInt(editDays, 10),
      }),
    });
    if (res.ok) {
      toast("Leave type updated", "success");
      setEditingType(null);
      fetchLeaveTypes();
    } else {
      const data = await res.json().catch(() => null);
      toast(data?.error ?? "Failed to update", "error");
    }
    setEditSaving(false);
  }

  async function handleDeleteLeaveType(lt: LeaveType) {
    if (!confirm(`Delete leave type "${lt.name}"? This cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/leave-types/${lt.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast("Leave type deleted", "success");
      fetchLeaveTypes();
      fetchPolicies();
    } else {
      const data = await res.json().catch(() => null);
      toast(data?.error ?? "Failed to delete", "error");
    }
  }

  async function handleAddPolicy(e: React.FormEvent) {
    e.preventDefault();
    setSavingPolicy(true);
    const res = await fetch("/api/leave-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaveTypeId: newPolicyType,
        countryCode: newPolicyCountry.toUpperCase(),
        annualAllowance: parseInt(newPolicyAllowance, 10),
        carryOverMax: parseInt(newPolicyCarryOver, 10),
      }),
    });
    if (res.ok) {
      toast("Policy added", "success");
      setShowAddPolicy(false);
      setNewPolicyType("");
      setNewPolicyAllowance("28");
      setNewPolicyCarryOver("0");
      fetchPolicies();
    } else {
      const data = await res.json().catch(() => null);
      toast(data?.error ?? "Failed to add policy", "error");
    }
    setSavingPolicy(false);
  }

  async function handleUpdatePolicy(
    id: string,
    patch: { annualAllowance?: number; carryOverMax?: number }
  ) {
    const res = await fetch(`/api/leave-policies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      toast("Policy updated", "success");
      fetchPolicies();
    } else {
      toast("Failed to update", "error");
    }
  }

  async function handleDeletePolicy(id: string) {
    if (!confirm("Delete this country policy?")) return;
    const res = await fetch(`/api/leave-policies/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Policy deleted", "success");
      fetchPolicies();
    } else {
      toast("Failed to delete", "error");
    }
  }

  async function handleAddLeaveType(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/leave-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        color: newColor,
        isPaid: newIsPaid,
        defaultDays: parseInt(newDays),
      }),
    });

    if (res.ok) {
      toast("Leave type added", "success");
      setShowAdd(false);
      setNewName("");
      setNewColor("#6366f1");
      setNewDays("20");
      setNewIsPaid(true);
      fetchLeaveTypes();
    } else {
      toast("Failed to add leave type", "error");
    }

    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Settings</h1>
        <p className="text-sm text-gray-500">
          Manage your organization and leave policies
        </p>
      </div>

      {/* Profile link */}
      <Link href="/settings/profile">
        <Card className="hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Profile &amp; account</p>
                  <p className="text-xs text-gray-500">Edit your name, change your password</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Organization info */}
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Your team information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Name</span>
              <span className="text-sm font-medium">{orgName ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Your role</span>
              <Badge variant={userRole === "ADMIN" ? "default" : "outline"}>
                {userRole ?? "—"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {orgSettings && (
        <Card>
          <CardHeader>
            <CardTitle>UK compliance settings</CardTitle>
            <CardDescription>Company-level UK leave and residency controls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Annual leave includes bank holidays</span>
              <input
                type="checkbox"
                checked={orgSettings.ukBankHolidayInclusive}
                onChange={(e) => saveOrgSettings({ ukBankHolidayInclusive: e.target.checked })}
              />
            </label>
            <Select
              id="ukRegion"
              label="UK bank holiday region"
              value={orgSettings.ukBankHolidayRegion}
              onChange={(e) => saveOrgSettings({ ukBankHolidayRegion: e.target.value as OrgSettings["ukBankHolidayRegion"] })}
              options={[
                { value: "ENGLAND_WALES", label: "England & Wales" },
                { value: "SCOTLAND", label: "Scotland" },
                { value: "NORTHERN_IRELAND", label: "Northern Ireland" },
              ]}
            />
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Enable carry-over</span>
              <input
                type="checkbox"
                checked={orgSettings.ukCarryOverEnabled}
                onChange={(e) =>
                  saveOrgSettings({
                    ukCarryOverEnabled: e.target.checked,
                    ukCarryOverMax: e.target.checked ? Math.min(8, Math.max(orgSettings.ukCarryOverMax, 1)) : 0,
                  })
                }
              />
            </label>
            <Input
              id="carryOverMax"
              label="Carry-over max days (0-8)"
              type="number"
              min="0"
              max="8"
              value={String(orgSettings.ukCarryOverMax)}
              onChange={(e) => saveOrgSettings({ ukCarryOverMax: parseInt(e.target.value || "0", 10) })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                id="carryOverExpiryMonth"
                label="Expiry month"
                value={String(orgSettings.ukCarryOverExpiryMonth)}
                onChange={(e) =>
                  saveOrgSettings({
                    ukCarryOverExpiryMonth: parseInt(e.target.value, 10),
                  })
                }
                options={[
                  { value: "1", label: "January" },
                  { value: "2", label: "February" },
                  { value: "3", label: "March" },
                  { value: "4", label: "April" },
                  { value: "5", label: "May" },
                  { value: "6", label: "June" },
                  { value: "7", label: "July" },
                  { value: "8", label: "August" },
                  { value: "9", label: "September" },
                  { value: "10", label: "October" },
                  { value: "11", label: "November" },
                  { value: "12", label: "December" },
                ]}
              />
              <Input
                id="carryOverExpiryDay"
                label="Expiry day"
                type="number"
                min="1"
                max="31"
                value={String(orgSettings.ukCarryOverExpiryDay)}
                onChange={(e) =>
                  saveOrgSettings({
                    ukCarryOverExpiryDay: parseInt(e.target.value || "1", 10),
                  })
                }
              />
            </div>
            <p className="text-xs text-gray-500">
              Carried-over days expire on{" "}
              {new Date(
                2000,
                orgSettings.ukCarryOverExpiryMonth - 1,
                orgSettings.ukCarryOverExpiryDay
              ).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
              })}{" "}
              of the new leave year. Run year-end rollover from the Reports
              page when the leave year closes.
            </p>
            <Select
              id="dataResidency"
              label="Data residency"
              value={orgSettings.dataResidency}
              onChange={(e) => saveOrgSettings({ dataResidency: e.target.value as OrgSettings["dataResidency"] })}
              options={[
                { value: "UK", label: "UK" },
                { value: "EU", label: "EU" },
                { value: "US", label: "US" },
              ]}
            />
            {orgSettings.dataResidency === "UK" && (
              <div className="rounded bg-green-50 p-2 text-xs font-medium text-green-700">
                Data stored in UK servers.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ukReport && (
        <Card>
          <CardHeader>
            <CardTitle>UK Compliance</CardTitle>
            <CardDescription>Holiday usage, absence triggers, SSP, and parental leave tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <p>Holiday usage rows: <strong>{ukReport.holidayUsage.length}</strong></p>
            <p>
              Bradford triggers above {ukReport.absenceTrigger.threshold}:{" "}
              <strong>{ukReport.absenceTrigger.rows.filter((r) => r.flagged).length}</strong>
            </p>
            <p>Employees currently on SSP: <strong>{ukReport.sspLiability.length}</strong></p>
            <p>Active parental leave cases: <strong>{ukReport.parentalTracker.length}</strong></p>
          </CardContent>
        </Card>
      )}

      {earningsCoverage && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 shrink-0 text-brand-500" />
                  Holiday pay earnings history
                </CardTitle>
                <CardDescription>
                  UK law requires holiday pay to reflect normal remuneration
                  (basic + regular overtime + commission + shift allowances)
                  averaged over the last 52 paid weeks. Employees without
                  earnings history will fall back to basic salary only.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {earningsCoverage.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                No employees in this organization yet.
              </p>
            ) : (
              <div className="space-y-2">
                {earningsCoverage
                  .filter((e) => !e.hasAnyHistory)
                  .map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                      <div className="flex-1">
                        <p className="text-amber-900">
                          Holiday pay for{" "}
                          <strong>{emp.name}</strong> is based on basic
                          salary only.{" "}
                          <Link
                            href={`/team/${emp.id}#earnings-history`}
                            className="font-medium underline hover:no-underline"
                          >
                            Add earnings history →
                          </Link>
                        </p>
                        {(emp.department || emp.countryCode) && (
                          <p className="mt-0.5 text-xs text-amber-700">
                            {[emp.department, emp.countryCode]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}


                {earningsCoverage.every((e) => e.hasAnyHistory) && (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    All employees have at least some earnings history on
                    file. Keep it up to date weekly for accurate holiday
                    pay calculations.
                  </p>
                )}

                {earningsCoverage.some((e) => e.hasAnyHistory) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-gray-600 hover:text-gray-900">
                      Coverage per employee (
                      {earningsCoverage.filter((e) => e.hasAnyHistory).length}{" "}
                      of {earningsCoverage.length} with history)
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 text-left text-gray-500">
                            <th className="py-1.5 pr-4">Employee</th>
                            <th className="py-1.5 pr-4">Paid weeks</th>
                            <th className="py-1.5 pr-4">Total weeks</th>
                            <th className="py-1.5">Last week on file</th>
                          </tr>
                        </thead>
                        <tbody>
                          {earningsCoverage.map((e) => (
                            <tr
                              key={e.id}
                              className="border-b border-gray-50"
                            >
                              <td className="py-1.5 pr-4 text-gray-900">
                                {e.name}
                              </td>
                              <td
                                className={`py-1.5 pr-4 ${e.paidWeeks >= 52 ? "text-emerald-700" : e.paidWeeks > 0 ? "text-amber-700" : "text-red-700"}`}
                              >
                                {e.paidWeeks}
                              </td>
                              <td className="py-1.5 pr-4 text-gray-600">
                                {e.totalWeeks}
                              </td>
                              <td className="py-1.5 text-gray-600">
                                {e.lastWeekStartDate
                                  ? new Date(
                                      e.lastWeekStartDate
                                    ).toLocaleDateString("en-GB")
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Leave types */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <CardTitle>Leave types</CardTitle>
              <CardDescription>
                Configure the types of leave available in your organization
              </CardDescription>
            </div>
            {isAdmin && (
              <Button
                size="sm"
                className="shrink-0 sm:mt-0.5"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add type
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : leaveTypes.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No leave types configured yet.
            </p>
          ) : (
            <div className="space-y-2">
              {leaveTypes.map((lt) => (
                <div
                  key={lt.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: lt.color }}
                    />
                    <span className="text-sm font-medium">{lt.name}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xs text-gray-500">
                      {lt.defaultDays} days
                    </span>
                    <Badge variant={lt.isPaid ? "success" : "outline"}>
                      {lt.isPaid ? "Paid" : "Unpaid"}
                    </Badge>
                    {isAdmin && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditType(lt)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteLeaveType(lt)}
                          title="Delete"
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Country policies */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <CardTitle>Country policies</CardTitle>
                <CardDescription>
                  Override statutory allowances and carry-over per leave type
                  and country. Applies to employees with the matching country
                  code.
                </CardDescription>
              </div>
              <Button
                size="sm"
                className="shrink-0 sm:mt-0.5"
                onClick={() => setShowAddPolicy(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add policy
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {policies.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                No country policies defined. Leave types fall back to their
                default allowance.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                      <th className="pb-2 pr-4">Leave type</th>
                      <th className="pb-2 pr-4">Country</th>
                      <th className="pb-2 pr-4 text-right">Allowance</th>
                      <th className="pb-2 pr-4 text-right">Carry-over max</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: p.leaveType.color }}
                            />
                            <span className="font-medium text-gray-900">
                              {p.leaveType.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-gray-600">
                          {p.countryCode}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <input
                            type="number"
                            min="0"
                            max="365"
                            defaultValue={p.annualAllowance}
                            onBlur={(e) => {
                              const next = parseInt(e.target.value, 10);
                              if (!isNaN(next) && next !== p.annualAllowance) {
                                handleUpdatePolicy(p.id, {
                                  annualAllowance: next,
                                });
                              }
                            }}
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-sm focus:border-brand-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <input
                            type="number"
                            min="0"
                            max="365"
                            defaultValue={p.carryOverMax}
                            onBlur={(e) => {
                              const next = parseInt(e.target.value, 10);
                              if (!isNaN(next) && next !== p.carryOverMax) {
                                handleUpdatePolicy(p.id, {
                                  carryOverMax: next,
                                });
                              }
                            }}
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-sm focus:border-brand-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeletePolicy(p.id)}
                            className="text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Slack integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-5 w-5" />
                Slack Integration
              </CardTitle>
              <CardDescription>
                Connect Slack for /whosout, /requestleave, and /mybalance commands
              </CardDescription>
            </div>
            {slackStatus?.connected ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Connected
              </Badge>
            ) : slackStatus?.configured ? (
              <Badge variant="error" className="flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Error
              </Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {slackStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Bot name</span>
                <span className="font-medium">@{slackStatus.botName}</span>
              </div>
              {slackStatus.teamName && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Workspace</span>
                  <span className="font-medium">{slackStatus.teamName}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Notification channel</span>
                <span className="font-medium">{slackStatus.channel}</span>
              </div>
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Available commands:</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <p><code className="rounded bg-gray-200 px-1">/whosout</code> — See who&apos;s off today and this week</p>
                  <p><code className="rounded bg-gray-200 px-1">/mybalance</code> — Check your leave balance</p>
                  <p><code className="rounded bg-gray-200 px-1">/requestleave</code> — Submit a leave request from Slack</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {SHOW_DEPLOYMENT_INTEGRATION_DOCS ? (
                <>
                  <p className="text-sm text-gray-500">
                    To enable the Slack bot, add these environment variables to your deployment:
                  </p>
                  <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600 space-y-1">
                    <p>SLACK_BOT_TOKEN=xoxb-...</p>
                    <p>SLACK_SIGNING_SECRET=...</p>
                    <p>SLACK_NOTIFICATION_CHANNEL=#time-off</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs text-blue-700">
                      <strong>Setup guide:</strong> Create a Slack app at{" "}
                      <a
                        href="https://api.slack.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        api.slack.com/apps
                      </a>
                      . Add bot token scopes: <code className="rounded bg-blue-100 px-1">commands</code>,{" "}
                      <code className="rounded bg-blue-100 px-1">chat:write</code>,{" "}
                      <code className="rounded bg-blue-100 px-1">users:read</code>,{" "}
                      <code className="rounded bg-blue-100 px-1">users:read.email</code>.
                      Set slash command URLs to <code className="rounded bg-blue-100 px-1">your-domain/api/slack/commands</code>{" "}
                      and interactivity URL to <code className="rounded bg-blue-100 px-1">your-domain/api/slack/interactions</code>.
                    </p>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
                  <p className="text-sm text-gray-600">
                    The Slack bot isn&apos;t configured for this deployment. Credentials are set on the server by whoever hosts Coverboard — not from this screen.
                  </p>
                  {isAdmin ? (
                    <p className="mt-2 text-xs text-gray-500">
                      If your team self-hosts, point a developer or DevOps engineer at the Slack section in the project README.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">
                      Ask an organisation admin if you need this enabled.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jira integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 mb-2">
                <SquareKanban className="h-5 w-5" />
                Jira Integration
              </CardTitle>
              <CardDescription>
                See unfinished tasks when someone goes on leave and reassign with one click
              </CardDescription>
            </div>
            {jiraStatus?.connected ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Connected
              </Badge>
            ) : jiraStatus?.configured ? (
              <Badge variant="outline">Not connected</Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {jiraStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Jira site</span>
                <a
                  href={jiraStatus.siteUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:text-brand-500 flex items-center gap-1"
                >
                  {jiraStatus.siteUrl?.replace("https://", "")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Connected by</span>
                <span className="font-medium">{jiraStatus.connectedBy}</span>
              </div>
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">What this enables:</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <p>Coverage warnings when someone goes on leave with open tasks</p>
                  <p>Available teammate suggestions for task reassignment</p>
                  <p>One-click issue reassignment from the leave review screen</p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={disconnectingJira}
                  onClick={async () => {
                    setDisconnectingJira(true);
                    try {
                      const res = await fetch("/api/jira/disconnect", { method: "POST" });
                      if (res.ok) {
                        toast("Jira disconnected", "success");
                        setJiraStatus({ configured: true, connected: false, siteUrl: null, connectedBy: null });
                      } else {
                        toast("Failed to disconnect Jira", "error");
                      }
                    } catch {
                      toast("Failed to disconnect Jira", "error");
                    } finally {
                      setDisconnectingJira(false);
                    }
                  }}
                >
                  <Unlink className="mr-1 h-3.5 w-3.5" />
                  {disconnectingJira ? "Disconnecting..." : "Disconnect Jira"}
                </Button>
              )}
            </div>
          ) : jiraStatus?.configured ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Connect your Jira Cloud site to see coverage warnings when team members go on leave.
              </p>
              {isAdmin ? (
                <Button
                  size="sm"
                  onClick={() => { window.location.href = "/api/jira/connect"; }}
                >
                  Connect Jira
                </Button>
              ) : (
                <p className="text-xs text-gray-400">Ask an admin to connect Jira.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {SHOW_DEPLOYMENT_INTEGRATION_DOCS ? (
                <>
                  <p className="text-sm text-gray-500">
                    To enable the Jira integration, add these environment variables to your deployment:
                  </p>
                  <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600 space-y-1">
                    <p>JIRA_CLIENT_ID=...</p>
                    <p>JIRA_CLIENT_SECRET=...</p>
                    <p>JIRA_REDIRECT_URI=https://your-domain/api/jira/callback</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs text-blue-700">
                      <strong>Setup guide:</strong> Create an OAuth 2.0 (3LO) app at{" "}
                      <a
                        href="https://developer.atlassian.com/console/myapps/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        developer.atlassian.com
                      </a>
                      . Add scopes: <code className="rounded bg-blue-100 px-1">read:jira-work</code>,{" "}
                      <code className="rounded bg-blue-100 px-1">write:jira-work</code>,{" "}
                      <code className="rounded bg-blue-100 px-1">read:jira-user</code>,{" "}
                      <code className="rounded bg-blue-100 px-1">read:me</code>,{" "}
                      <code className="rounded bg-blue-100 px-1">offline_access</code>.
                    </p>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
                  <p className="text-sm text-gray-600">
                    Jira isn&apos;t configured for this deployment. OAuth credentials are set on the server by whoever hosts Coverboard — not from this screen.
                  </p>
                  {isAdmin ? (
                    <p className="mt-2 text-xs text-gray-500">
                      If your team self-hosts, point a developer or DevOps engineer at the Jira section in the project README.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">
                      Ask an organisation admin if you need this enabled.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add leave type dialog */}
      <Dialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add leave type"
      >
        <form onSubmit={handleAddLeaveType} className="space-y-4">
          <Input
            id="ltName"
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Study Leave"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                />
                <span className="text-xs text-gray-500">{newColor}</span>
              </div>
            </div>
            <Input
              id="ltDays"
              label="Default days"
              type="number"
              min="1"
              value={newDays}
              onChange={(e) => setNewDays(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newIsPaid}
              onChange={(e) => setNewIsPaid(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Paid leave
          </label>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Adding..." : "Add leave type"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit leave type dialog */}
      <Dialog
        open={!!editingType}
        onClose={() => setEditingType(null)}
        title="Edit leave type"
      >
        <form onSubmit={handleEditLeaveType} className="space-y-4">
          <Input
            id="editLtName"
            label="Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                />
                <span className="text-xs text-gray-500">{editColor}</span>
              </div>
            </div>
            <Input
              id="editLtDays"
              label="Default days"
              type="number"
              min="0"
              value={editDays}
              onChange={(e) => setEditDays(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editIsPaid}
              onChange={(e) => setEditIsPaid(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Paid leave
          </label>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={editSaving}>
              {editSaving ? "Saving..." : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingType(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add country policy dialog */}
      <Dialog
        open={showAddPolicy}
        onClose={() => setShowAddPolicy(false)}
        title="Add country policy"
      >
        <form onSubmit={handleAddPolicy} className="space-y-4">
          <Select
            id="policyType"
            label="Leave type"
            value={newPolicyType}
            onChange={(e) => setNewPolicyType(e.target.value)}
            required
            options={leaveTypes.map((lt) => ({
              value: lt.id,
              label: lt.name,
            }))}
            placeholder="Select a leave type"
          />
          <Input
            id="policyCountry"
            label="Country code (ISO-2)"
            value={newPolicyCountry}
            onChange={(e) =>
              setNewPolicyCountry(e.target.value.toUpperCase().slice(0, 2))
            }
            placeholder="GB"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="policyAllowance"
              label="Annual allowance (days)"
              type="number"
              min="0"
              max="365"
              value={newPolicyAllowance}
              onChange={(e) => setNewPolicyAllowance(e.target.value)}
              required
            />
            <Input
              id="policyCarryOver"
              label="Carry-over max (days)"
              type="number"
              min="0"
              max="365"
              value={newPolicyCarryOver}
              onChange={(e) => setNewPolicyCarryOver(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={savingPolicy}>
              {savingPolicy ? "Adding..." : "Add policy"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddPolicy(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {isAdmin && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-900">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete your organization and all data. A 30-day grace
              period applies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/account/delete"
              className="inline-flex rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete account and all data →
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

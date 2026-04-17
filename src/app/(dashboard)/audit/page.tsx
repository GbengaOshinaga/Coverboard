"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Download, ShieldCheck, Lock } from "lucide-react";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { hasAuditTrail, type SubscriptionPlan } from "@/lib/plans";

type AuditLog = {
  id: string;
  organizationId: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type AuditLogsApiResponse = {
  logs: AuditLog[];
  nextCursor: string | null;
};

const RESOURCES = [
  "leave_request",
  "team_member",
  "leave_type",
  "leave_policy",
  "organization",
  "carry_over",
  "onboarding",
];

export default function AuditPage() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [plan, setPlan] = useState<SubscriptionPlan | undefined>();
  const [denied, setDenied] = useState(false);

  const [filterAction, setFilterAction] = useState("");
  const [filterResource, setFilterResource] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const { toast } = useToast();

  const user = session?.user as Record<string, unknown> | undefined;
  const userRole = user?.role as string | undefined;
  const isAdmin = userRole === "ADMIN";

  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch("/api/organization/settings");
        if (res.ok) {
          const data = await res.json();
          setPlan(data.plan);
        }
      } catch {
        // ignore
      }
    }
    if (isAdmin) fetchPlan();
  }, [isAdmin]);

  const buildQuery = useCallback(
    (cursor?: string) => {
      const qs = new URLSearchParams();
      if (filterAction) qs.set("action", filterAction);
      if (filterResource) qs.set("resource", filterResource);
      if (filterFrom) qs.set("from", new Date(filterFrom).toISOString());
      if (filterTo) {
        const end = new Date(filterTo);
        end.setHours(23, 59, 59, 999);
        qs.set("to", end.toISOString());
      }
      if (cursor) qs.set("cursor", cursor);
      qs.set("limit", "100");
      return qs.toString();
    },
    [filterAction, filterResource, filterFrom, filterTo]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      const res = await fetch(`/api/audit-logs?${buildQuery()}`);
      if (res.status === 403) {
        setDenied(true);
        setLogs([]);
        setNextCursor(null);
      } else if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setNextCursor(data.nextCursor);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [buildQuery]);

  useEffect(() => {
    if (isAdmin) fetchLogs();
  }, [isAdmin, fetchLogs]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/audit-logs?${buildQuery(nextCursor)}`);
      if (res.ok) {
        const data = await res.json();
        setLogs((prev) => [...prev, ...data.logs]);
        setNextCursor(data.nextCursor);
      }
    } catch {
      // ignore
    }
    setLoadingMore(false);
  }

  async function exportAll() {
    const all: AuditLog[] = [];
    let cursor: string | null = null;
    try {
      do {
        const res: Response = await fetch(
          `/api/audit-logs?${buildQuery(cursor ?? undefined)}`
        );
        if (!res.ok) break;
        const data: AuditLogsApiResponse = await res.json();
        all.push(...data.logs);
        cursor = data.nextCursor;
      } while (cursor && all.length < 50000);

      if (all.length === 0) {
        toast("No entries to export", "error");
        return;
      }

      const rows = all.map((l) => ({
        createdAt: l.createdAt,
        actorEmail: l.actorEmail ?? "",
        actorRole: l.actorRole ?? "",
        action: l.action,
        resource: l.resource,
        resourceId: l.resourceId ?? "",
        metadata: l.metadata ? JSON.stringify(l.metadata) : "",
        ipAddress: l.ipAddress ?? "",
        userAgent: l.userAgent ?? "",
      }));

      downloadCsv(
        `audit-trail-${new Date().toISOString().slice(0, 10)}`,
        toCsv(rows, [
          { key: "createdAt", label: "Timestamp" },
          { key: "actorEmail", label: "Actor" },
          { key: "actorRole", label: "Role" },
          { key: "action", label: "Action" },
          { key: "resource", label: "Resource" },
          { key: "resourceId", label: "Resource ID" },
          { key: "metadata", label: "Metadata" },
          { key: "ipAddress", label: "IP" },
          { key: "userAgent", label: "User agent" },
        ])
      );

      toast(`Exported ${all.length} entries`, "success");
    } catch {
      toast("Export failed", "error");
    }
  }

  const actionOptions = useMemo(
    () => [
      { value: "", label: "All actions" },
      ...AUDIT_ACTIONS.map((a) => ({ value: a, label: a })),
    ],
    []
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          Audit trail
        </h1>
        <p className="text-sm text-gray-500">
          The audit trail is available to admins only.
        </p>
      </div>
    );
  }

  const planBlocked = !hasAuditTrail(plan) || denied;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            Audit trail
          </h1>
          <p className="text-sm text-gray-500">
            Immutable record of admin and user actions across your organization.
          </p>
        </div>
        {!planBlocked && (
          <Button size="sm" variant="outline" onClick={exportAll}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        )}
      </div>

      {planBlocked ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Pro plan required
            </CardTitle>
            <CardDescription>
              Audit trail viewer and CSV exports are part of the Pro plan.
              Contact us to upgrade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="mailto:hello@coverboard.app"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              hello@coverboard.app
            </a>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-500" />
                Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Select
                  id="filterAction"
                  label="Action"
                  options={actionOptions}
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                />
                <Select
                  id="filterResource"
                  label="Resource"
                  options={[
                    { value: "", label: "All resources" },
                    ...RESOURCES.map((r) => ({ value: r, label: r })),
                  ]}
                  value={filterResource}
                  onChange={(e) => setFilterResource(e.target.value)}
                />
                <Input
                  id="filterFrom"
                  label="From"
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                />
                <Input
                  id="filterTo"
                  label="To"
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={fetchLogs}>
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilterAction("");
                    setFilterResource("");
                    setFilterFrom("");
                    setFilterTo("");
                    setTimeout(fetchLogs, 0);
                  }}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <p className="py-4 text-center text-sm text-gray-400">
                  Loading...
                </p>
              ) : logs.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">
                  No audit entries match your filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                        <th className="pb-2 pr-4">Time</th>
                        <th className="pb-2 pr-4">Actor</th>
                        <th className="pb-2 pr-4">Action</th>
                        <th className="pb-2 pr-4">Resource</th>
                        <th className="pb-2">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr
                          key={log.id}
                          className="border-b border-gray-50 align-top"
                        >
                          <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-gray-600">
                            {new Date(log.createdAt).toLocaleString("en-GB", {
                              dateStyle: "short",
                              timeStyle: "medium",
                            })}
                          </td>
                          <td className="py-2.5 pr-4">
                            <div className="text-sm font-medium text-gray-900">
                              {log.actorEmail ?? "System"}
                            </div>
                            {log.actorRole && (
                              <div className="text-[10px] uppercase text-gray-500">
                                {log.actorRole}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {log.action}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-gray-600">
                            <div>{log.resource}</div>
                            {log.resourceId && (
                              <div className="mt-0.5 font-mono text-[10px] text-gray-400">
                                {log.resourceId.slice(0, 12)}...
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 max-w-sm break-words text-xs text-gray-600">
                            {log.metadata ? (
                              <code className="text-[11px]">
                                {JSON.stringify(log.metadata)}
                              </code>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {nextCursor && (
                <div className="mt-4 flex justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

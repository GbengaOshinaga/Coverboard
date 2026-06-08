"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Lock } from "lucide-react";

type ActivityEntry = {
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
  createdAt: string;
};

type ApiResponse = {
  logs: ActivityEntry[];
  nextCursor: string | null;
};

/**
 * Plain-English label for each audit action. Anything not listed falls
 * back to the raw action string with underscores replaced by spaces.
 */
const ACTION_LABEL: Record<string, string> = {
  "team_member.created": "Added to team",
  "team_member.updated": "Profile updated",
  "team_member.deleted": "Removed from team",
  "team_member.role_changed": "Role changed",
  "team_member.bulk_imported": "Bulk imported",
  "team_member.invite_resent": "Invite resent",
  "team_member.viewed": "Profile viewed",
  "leave_request.created": "Leave request created",
  "leave_request.approved": "Leave request approved",
  "leave_request.rejected": "Leave request rejected",
  "leave_request.cancelled": "Leave request cancelled",
  "leave_request.kit_days_updated": "KIT days updated",
  "leave_request.ssp_cap_reached": "SSP cap reached",
  "leave_request.cover_overridden": "Cover override applied",
  "leave_request.sickness_viewed": "Sickness note viewed",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ");
}

function actionTone(action: string): "default" | "outline" | "warning" {
  if (action.endsWith(".viewed")) return "outline";
  if (action.includes("rejected") || action.includes("deleted")) return "warning";
  return "default";
}

export function ActivityLog({ memberId }: { memberId: string }) {
  const [logs, setLogs] = useState<ActivityEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [blocked, setBlocked] = useState<"plan" | "forbidden" | null>(null);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      if (cursor) qs.set("cursor", cursor);
      return fetch(`/api/team-members/${memberId}/activity?${qs.toString()}`);
    },
    [memberId]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setBlocked(null);
      try {
        const res = await fetchPage();
        if (cancelled) return;
        if (res.status === 403) {
          // Plan gating returns 403 with a specific message; we treat any
          // other 403 (role) the same way visually.
          const data: { error?: string } = await res.json().catch(() => ({}));
          setBlocked(/Pro plan/i.test(data.error ?? "") ? "plan" : "forbidden");
          setLogs([]);
          setNextCursor(null);
        } else if (res.ok) {
          const data: ApiResponse = await res.json();
          setLogs(data.logs);
          setNextCursor(data.nextCursor);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(nextCursor);
      if (res.ok) {
        const data: ApiResponse = await res.json();
        setLogs((prev) => [...prev, ...data.logs]);
        setNextCursor(data.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  if (blocked === "plan") {
    return (
      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-amber-600" />
            Pro plan required
          </CardTitle>
          <CardDescription>
            The per-employee activity log records who in your organisation
            viewed this profile, opened a sickness note, or changed something
            on a leave request. Available on the Pro plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/settings/billing/change-plan"
            className="inline-flex rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Upgrade to Pro
          </a>
        </CardContent>
      </Card>
    );
  }

  if (blocked === "forbidden") {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-gray-500">
          The activity log is available to admins only.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-brand-500" />
          Activity log
        </CardTitle>
        <CardDescription>
          Who looked at this profile, opened a sickness note, or changed a
          leave request — most recent first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-4 text-center text-sm text-gray-400">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            No activity recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {logs.map((log) => (
              <li key={log.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge
                    variant={actionTone(log.action)}
                    className="font-normal"
                  >
                    {actionLabel(log.action)}
                  </Badge>
                  <span className="text-sm text-gray-700">
                    {log.actorEmail ?? "System"}
                  </span>
                  {log.actorRole && (
                    <span className="text-[10px] uppercase text-gray-400">
                      {log.actorRole}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <time dateTime={log.createdAt}>
                    {new Date(log.createdAt).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                  {log.ipAddress && (
                    <span className="font-mono text-[10px] text-gray-400">
                      {log.ipAddress}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

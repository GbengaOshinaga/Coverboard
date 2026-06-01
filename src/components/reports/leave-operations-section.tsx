"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarOff,
  CalendarCheck2,
  Clock,
  Stethoscope,
  Building2,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Leave operations dashboard — Scale tier landing view.
 *
 * Pulls together six operational signals: out today, returning this
 * week, pending approvals (with age), overdue fit notes, regions under
 * cover this week, and top Bradford scores. Built for scan-ability:
 * KPI strip on top, three short lists below.
 */

type ListItem = {
  leaveId: string;
  userId?: string;
  userName: string;
  leaveTypeName: string;
  leaveColor?: string | null;
  endDate?: string;
};

type PendingItem = {
  leaveId: string;
  userName: string;
  leaveTypeName: string;
  startDate: string;
  daysWaiting: number;
};

type FitNoteItem = {
  leaveId: string;
  userName: string;
  daysElapsed: number;
};

type RegionUnderCover = {
  regionId: string;
  name: string;
  daysBelowCover: number;
};

type BradfordItem = {
  userId: string;
  name: string;
  score: number;
};

type Response = {
  generatedAt: string;
  headline: {
    outTodayCount: number;
    returningSoonCount: number;
    pendingCount: number;
    oldestPendingDays: number;
    overdueFitNotesCount: number;
    regionsUnderCoverCount: number;
  };
  outToday: ListItem[];
  returningSoon: ListItem[];
  pendingSamples: PendingItem[];
  overdueFitNotes: FitNoteItem[];
  regionsUnderCoverThisWeek: RegionUnderCover[];
  topBradford: BradfordItem[];
};

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: typeof CalendarOff;
  label: string;
  value: number | string;
  sub?: string;
  tone?: "neutral" | "warn" | "danger" | "good";
}) {
  const toneCls =
    tone === "danger"
      ? "bg-red-50 text-red-700"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700"
      : tone === "good"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-brand-50 text-brand-700";
  return (
    <div className={`rounded-xl p-4 ${toneCls}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium opacity-80">{label}</p>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

export function LeaveOperationsSection() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reports/leave-operations");
        const body = (await res.json().catch(() => ({}))) as
          | Response
          | { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(
            "error" in body && body.error
              ? body.error
              : "Could not load operations dashboard."
          );
          setLoading(false);
          return;
        }
        setData(body as Response);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError("Could not load operations dashboard.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-gray-500">
          Loading operations dashboard…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-red-700">{error}</CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const h = data.headline;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          icon={CalendarOff}
          label="Out today"
          value={h.outTodayCount}
          tone={h.outTodayCount > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          icon={CalendarCheck2}
          label="Returning this week"
          value={h.returningSoonCount}
        />
        <KpiCard
          icon={Clock}
          label="Pending approvals"
          value={h.pendingCount}
          sub={
            h.oldestPendingDays > 2
              ? `Oldest: ${h.oldestPendingDays} days`
              : undefined
          }
          tone={h.oldestPendingDays > 4 ? "danger" : h.pendingCount > 0 ? "warn" : "good"}
        />
        <KpiCard
          icon={Stethoscope}
          label="Overdue fit notes"
          value={h.overdueFitNotesCount}
          tone={h.overdueFitNotesCount > 0 ? "danger" : "good"}
        />
        <KpiCard
          icon={Building2}
          label="Regions under cover"
          value={h.regionsUnderCoverCount}
          tone={h.regionsUnderCoverCount > 0 ? "warn" : "good"}
        />
        <KpiCard
          icon={TrendingUp}
          label="Top Bradford"
          value={data.topBradford[0]?.score ?? 0}
          sub={data.topBradford[0]?.name ?? "No alerts"}
          tone={
            (data.topBradford[0]?.score ?? 0) >= 200 ? "danger" : "neutral"
          }
        />
      </div>

      {/* Lists */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarOff className="h-4 w-4 text-brand-600" />
              Out today
            </CardTitle>
            <CardDescription>
              {data.outToday.length === 0
                ? "Nobody is out."
                : `Showing ${data.outToday.length} active absence${data.outToday.length === 1 ? "" : "s"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.outToday.length === 0 ? (
              <p className="text-sm text-gray-500">All present.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.outToday.map((l) => (
                  <li
                    key={l.leaveId}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="font-medium text-gray-900">
                      {l.userName}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-gray-500">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: l.leaveColor ?? "#9ca3af" }}
                      />
                      {l.leaveTypeName}
                      {l.endDate && (
                        <span className="text-gray-400">
                          · back {DATE_FMT.format(new Date(l.endDate))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck2 className="h-4 w-4 text-brand-600" />
              Returning this week
            </CardTitle>
            <CardDescription>
              Next 7 days &mdash; useful for handover planning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.returningSoon.length === 0 ? (
              <p className="text-sm text-gray-500">No returns expected.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.returningSoon.map((l) => (
                  <li
                    key={l.leaveId}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="font-medium text-gray-900">
                      {l.userName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {l.leaveTypeName}
                      {l.endDate && (
                        <span className="ml-2 text-gray-400">
                          {DATE_FMT.format(new Date(l.endDate))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action needed */}
      {(data.pendingSamples.length > 0 ||
        data.overdueFitNotes.length > 0 ||
        data.regionsUnderCoverThisWeek.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Action needed
            </CardTitle>
            <CardDescription>
              Things to clear off the desk today.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.pendingSamples.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Pending approvals
                </p>
                <ul className="divide-y divide-gray-100">
                  {data.pendingSamples.map((p) => (
                    <li
                      key={p.leaveId}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium text-gray-900">
                          {p.userName}
                        </span>{" "}
                        <span className="text-gray-500">
                          — {p.leaveTypeName} from{" "}
                          {DATE_FMT.format(new Date(p.startDate))}
                        </span>
                      </span>
                      <Badge
                        variant={p.daysWaiting > 4 ? "error" : p.daysWaiting > 2 ? "warning" : "outline"}
                      >
                        {p.daysWaiting === 0
                          ? "Today"
                          : `${p.daysWaiting}d waiting`}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/requests"
                  className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Review all requests &rarr;
                </Link>
              </div>
            )}

            {data.overdueFitNotes.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Overdue fit notes
                </p>
                <ul className="divide-y divide-gray-100">
                  {data.overdueFitNotes.map((f) => (
                    <li
                      key={f.leaveId}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="font-medium text-gray-900">
                        {f.userName}
                      </span>
                      <Badge variant="error">Day {f.daysElapsed}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.regionsUnderCoverThisWeek.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Regions under cover this week
                </p>
                <ul className="divide-y divide-gray-100">
                  {data.regionsUnderCoverThisWeek.map((r) => (
                    <li
                      key={r.regionId}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="font-medium text-gray-900">
                        {r.name}
                      </span>
                      <Badge variant="warning">
                        {r.daysBelowCover} day{r.daysBelowCover === 1 ? "" : "s"} under
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkingTimeRow } from "@/lib/working-time";

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Working time over the last 17 full weeks (src/lib/working-time.ts): the
 * 48-hour average, opt-outs, and rest gaps under 11 hours.
 */
export function WorkingTimeSection() {
  const [data, setData] = useState<{ from: string; toWeekStarting: string; rows: WorkingTimeRow[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/reports/working-time")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  // Most serious first: over the average without an opt-out, then short
  // rest, then single weeks over 48; otherwise alphabetical (as loaded).
  const severity = (r: WorkingTimeRow) =>
    r.overAverageLimit
      ? 0
      : r.restGapCount > 0 || r.upcomingRestGaps.length > 0
        ? 1
        : r.thisWeekHours > 48 || r.nextWeekHours > 48 || r.weeksOver48 > 0
          ? 2
          : 3;
  const rows = data ? [...data.rows].sort((a, b) => severity(a) - severity(b)) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Working time</CardTitle>
            <CardDescription>
              The last 17 full weeks{data ? ` (${fmt(data.from)} – week of ${fmt(data.toWeekStarting)})` : ""}:
              average weekly hours against the 48-hour limit, and rest under 11
              hours between shifts. This week and next show what&apos;s
              rostered, so a new rota shows up before it&apos;s worked.
              Hours are logged hours where recorded,
              otherwise working pattern and accepted cover, minus leave, so
              they&apos;re an estimate, not timesheets. New starters are
              averaged over the weeks since their employment start date, so add
              start dates to profiles. Opt-outs are recorded on each
              person&apos;s profile.
            </CardDescription>
          </div>
          <a
            href="/api/reports/working-time?format=csv"
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-gray-300 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </a>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-700">Couldn&apos;t load working time.</p>}
        {!error && !data && <p className="text-sm text-gray-500">Loading…</p>}
        {data && data.rows.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">No UK employees found.</p>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="pb-2 pr-4">Employee</th>
                  <th className="pb-2 pr-4 text-right">Average a week</th>
                  <th className="pb-2 pr-4 text-right">Highest week</th>
                  <th className="pb-2 pr-4 text-right">This week (rostered)</th>
                  <th className="pb-2 pr-4">Rest under 11h</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId} className="border-b border-gray-50 align-top">
                    <td className="py-2.5 pr-4 font-medium text-gray-900">{row.name}</td>
                    <td className="py-2.5 pr-4 text-right font-mono">
                      {row.averageHours}h
                      {row.weeksCounted < 17 && (
                        <span className="block text-[11px] font-sans text-gray-500">
                          over {row.weeksCounted} week{row.weeksCounted === 1 ? "" : "s"}{" "}
                          {row.averagedFrom === "start_date" ? "since starting" : "since first recorded work"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-gray-600">
                      {row.highestWeek}h
                      {row.weeksOver48 > 0 && (
                        <span className="block text-[11px] font-sans text-gray-500">
                          {row.weeksOver48} week{row.weeksOver48 === 1 ? "" : "s"} over 48
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono">
                      <span className={row.thisWeekHours > 48 ? "text-amber-700" : ""}>{row.thisWeekHours}h</span>
                      <span className="block text-[11px] font-sans text-gray-500">next week {row.nextWeekHours}h</span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-600">
                      {row.upcomingRestGaps.length > 0 && (
                        <span className="block text-amber-700">
                          Coming up: {row.upcomingRestGaps[0].gapHours}h on {fmt(row.upcomingRestGaps[0].date)}
                          {row.upcomingRestGaps.length > 1 ? ` (+${row.upcomingRestGaps.length - 1} more)` : ""}
                        </span>
                      )}
                      {row.restGapCount > 0
                        ? `${row.restGapCount} time${row.restGapCount === 1 ? "" : "s"}, latest ${row.latestRestGap!.gapHours}h on ${fmt(row.latestRestGap!.date)}`
                        : row.upcomingRestGaps.length === 0
                          ? "—"
                          : null}
                    </td>
                    <td className="py-2.5">
                      {row.overAverageLimit ? (
                        <Badge variant="error">Over the 48-hour average, no opt-out</Badge>
                      ) : row.restGapCount > 0 || row.upcomingRestGaps.length > 0 ? (
                        <Badge variant="warning">Short rest between shifts</Badge>
                      ) : row.thisWeekHours > 48 || row.nextWeekHours > 48 ? (
                        <Badge variant="warning">Rostered over 48 this week or next</Badge>
                      ) : row.optedOut ? (
                        <Badge variant="outline">Opted out</Badge>
                      ) : (
                        <Badge variant="success">Within limits</Badge>
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
  );
}

"use client";

import { useEffect, useState } from "react";
import { Building2, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Regional cover analytics section for the reports page. Scale-tier.
 *
 * Each region gets a weekly strip — 13 little bars, coloured by how many
 * days that week the region dropped below its minCover. Headline numbers
 * + the worst-coverage callout sit alongside.
 */

type WeekStat = {
  weekStart: string;
  weekKey: string;
  daysBelowCover: number;
  minCoverageObserved: number;
};

type RegionReport = {
  regionId: string;
  name: string;
  minCover: number;
  memberCount: number;
  totalDaysBelowCover: number;
  minCoverageObserved: number;
  weeklySeries: WeekStat[];
};

type Response = {
  regionsEnabled: boolean;
  generatedAt: string;
  weeksBack: number;
  regions: RegionReport[];
};

const WEEK_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

function weekColor(daysBelow: number): string {
  if (daysBelow === 0) return "#10b981"; // emerald — clean
  if (daysBelow <= 2) return "#f59e0b"; // amber — touch under
  return "#dc2626"; // red — sustained under-cover
}

function CoverageStrip({ weeks }: { weeks: ReadonlyArray<WeekStat> }) {
  const cellWidth = 14;
  const cellHeight = 24;
  const gap = 2;
  const width = weeks.length * (cellWidth + gap);
  return (
    <svg
      width={width}
      height={cellHeight}
      viewBox={`0 0 ${width} ${cellHeight}`}
      role="img"
      aria-label="Weekly under-cover days"
    >
      {weeks.map((w, i) => (
        <rect
          key={w.weekKey}
          x={i * (cellWidth + gap)}
          y={0}
          width={cellWidth}
          height={cellHeight}
          rx={2}
          fill={weekColor(w.daysBelowCover)}
        >
          <title>{`${WEEK_FMT.format(new Date(w.weekStart))} — ${w.daysBelowCover} day${w.daysBelowCover === 1 ? "" : "s"} below cover (min observed ${w.minCoverageObserved})`}</title>
        </rect>
      ))}
    </svg>
  );
}

export function RegionalCoverSection() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reports/regional-cover");
        const body = (await res.json().catch(() => ({}))) as
          | Response
          | { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(
            "error" in body && body.error
              ? body.error
              : "Could not load regional cover analytics."
          );
          setLoading(false);
          return;
        }
        setData(body as Response);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError("Could not load regional cover analytics.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-brand-600" />
          Regional cover — last 13 weeks
        </CardTitle>
        <CardDescription>
          Each square is one week. Green = met cover every day; amber = 1–2
          days under; red = 3+ days under. Hover for the worst-day count.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!loading && !error && data && !data.regionsEnabled && (
          <p className="text-sm text-gray-500">
            Regions aren&rsquo;t enabled for this organisation. Turn them on
            in <strong>Settings &rarr; UK Compliance &rarr; Regions</strong>{" "}
            to start tracking cover by location or team.
          </p>
        )}
        {!loading && !error && data?.regionsEnabled && data.regions.length === 0 && (
          <p className="text-sm text-gray-500">
            No active regions with members yet. Create at least one region
            from the team page to track cover.
          </p>
        )}
        {!loading && !error && data?.regionsEnabled && data.regions.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Region</th>
                  <th className="px-3 py-2 text-right">Members</th>
                  <th className="px-3 py-2 text-right">Min cover</th>
                  <th className="px-3 py-2 text-right">Days under (13wk)</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Weekly</th>
                </tr>
              </thead>
              <tbody>
                {data.regions.map((r) => {
                  const clean = r.totalDaysBelowCover === 0;
                  return (
                    <tr
                      key={r.regionId}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {r.memberCount}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {r.minCover}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {r.totalDaysBelowCover}
                      </td>
                      <td className="px-3 py-2">
                        {clean ? (
                          <Badge
                            variant="success"
                            className="inline-flex items-center gap-1"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            On cover
                          </Badge>
                        ) : (
                          <Badge
                            variant="error"
                            className="inline-flex items-center gap-1"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Under cover
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <CoverageStrip weeks={r.weeklySeries} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

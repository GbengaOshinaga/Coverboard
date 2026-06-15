"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Absence trends section for the reports page. Scale-tier feature.
 *
 * Renders a per-employee monthly sickness-day series as an inline SVG
 * sparkline + headline numbers. No chart library — the data shape is
 * small (12 months, ≤ ~50 users) and the SVG path is fast to compute
 * client-side.
 */

type MonthlyMetric = {
  monthStart: string;
  monthKey: string;
  days: number;
  spells: number;
};

type UserTrend = {
  userId: string;
  name: string;
  currentBradfordScore: number;
  totalDaysLast12Months: number;
  totalSpellsLast12Months: number;
  monthlySeries: MonthlyMetric[];
  direction: 1 | 0 | -1;
};

type TrendsResponse = {
  generatedAt: string;
  monthsBack: number;
  users: UserTrend[];
};

const MONTH_SHORT = new Intl.DateTimeFormat("en-GB", { month: "short" });

function Sparkline({
  series,
  width = 140,
  height = 32,
}: {
  series: ReadonlyArray<MonthlyMetric>;
  width?: number;
  height?: number;
}) {
  if (series.length === 0) return null;
  const max = Math.max(1, ...series.map((m) => m.days));
  const barWidth = width / series.length;
  const padding = 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Monthly sickness days, ${series.length} months`}
    >
      {series.map((m, i) => {
        const h = Math.max(1, (m.days / max) * (height - 4));
        const x = i * barWidth + padding;
        const y = height - h;
        const heavy = m.days >= 5;
        return (
          <rect
            key={m.monthKey}
            x={x}
            y={y}
            width={Math.max(2, barWidth - padding * 2)}
            height={h}
            rx={1}
            fill={heavy ? "#dc2626" : m.days > 0 ? "#f59e0b" : "#e5e7eb"}
          >
            <title>{`${MONTH_SHORT.format(new Date(m.monthStart))} — ${m.days} day${m.days === 1 ? "" : "s"}, ${m.spells} spell${m.spells === 1 ? "" : "s"}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function DirectionBadge({ direction }: { direction: -1 | 0 | 1 }) {
  if (direction === 1) {
    return (
      <Badge variant="error" className="inline-flex items-center gap-1">
        <ArrowUpRight className="h-3 w-3" />
        Rising
      </Badge>
    );
  }
  if (direction === -1) {
    return (
      <Badge variant="success" className="inline-flex items-center gap-1">
        <ArrowDownRight className="h-3 w-3" />
        Falling
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="inline-flex items-center gap-1">
      <ArrowRight className="h-3 w-3" />
      Flat
    </Badge>
  );
}

export function AbsenceTrendsSection() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reports/absence-trends");
        const body = (await res.json().catch(() => ({}))) as
          | TrendsResponse
          | { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(
            "error" in body && body.error
              ? body.error
              : "Could not load absence trends."
          );
          setLoading(false);
          return;
        }
        setData(body as TrendsResponse);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError("Could not load absence trends.");
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
          <TrendingUp className="h-4 w-4 text-brand-600" />
          Absence trends — last 12 months
        </CardTitle>
        <CardDescription>
          Sickness days per employee, month by month. Heavier months show in
          red; the trend arrow compares the second half of the window to the
          first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="text-sm text-gray-500">Loading trends…</p>
        )}
        {error && (
          <p className="text-sm text-red-700">{error}</p>
        )}
        {!loading && !error && data && data.users.length === 0 && (
          <p className="text-sm text-gray-500">
            No sickness absence recorded in the last 12 months. Quiet is
            good.
          </p>
        )}
        {!loading && !error && data && data.users.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2 text-right">Days (12mo)</th>
                  <th className="px-3 py-2 text-right">Spells</th>
                  <th className="px-3 py-2">Trend</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2 text-right">Bradford</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr
                    key={u.userId}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {u.name}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900">
                      {u.totalDaysLast12Months}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900">
                      {u.totalSpellsLast12Months}
                    </td>
                    <td className="px-3 py-2">
                      <Sparkline series={u.monthlySeries} />
                    </td>
                    <td className="px-3 py-2">
                      <DirectionBadge direction={u.direction} />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900">
                      {Math.round(u.currentBradfordScore)}
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

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

type CoverCheckResult = {
  hasConflict: boolean;
  conflicts: Array<{
    date: string;
    available: number;
    required: number;
    shortfall: number;
    staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  }>;
  regionId: string | null;
  regionName: string | null;
  minCover: number | null;
};

const FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return FMT.format(new Date(y, m - 1, d));
}

export function RegionalCoverWarning({
  startDate,
  endDate,
  userId,
}: {
  startDate: string;
  endDate: string;
  userId?: string;
}) {
  const [result, setResult] = useState<CoverCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!startDate || !endDate) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/cover-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, userId }),
        });
        if (res.ok && !cancelled) setResult(await res.json());
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [startDate, endDate, userId]);

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Checking regional cover…
      </div>
    );
  }

  if (!result || !result.regionId) return null;

  if (!result.hasConflict) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Cover OK in <strong>{result.regionName}</strong> across this date
          range (minimum cover: {result.minCover}).
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="space-y-1.5">
          <p className="font-medium">
            Regional cover would drop below minimum on{" "}
            {result.conflicts.length} day
            {result.conflicts.length === 1 ? "" : "s"} in{" "}
            <strong>{result.regionName}</strong>.
          </p>
          <ul className="space-y-0.5 text-amber-900">
            {result.conflicts.slice(0, 5).map((c) => (
              <li key={c.date}>
                {formatDay(c.date)}: {c.available}/{c.required} available
                {c.staffOff.length > 0 && (
                  <span className="text-amber-700">
                    {" "}
                    — off: {c.staffOff.map((s) => s.name).join(", ")}
                  </span>
                )}
              </li>
            ))}
            {result.conflicts.length > 5 && (
              <li className="text-amber-700">
                …and {result.conflicts.length - 5} more.
              </li>
            )}
          </ul>
          <p className="text-amber-700">
            You can still submit — a manager will need to override cover when
            approving.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, MapPin } from "lucide-react";

type DailyCover = {
  date: string;
  available: number;
  required: number;
  isWeekend: boolean;
  isBankHoliday: boolean;
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  staffAvailable: Array<{ id: string; name: string }>;
};

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

export function RegionalCoverPanel({
  leaveRequestId,
  startDate,
  endDate,
  coverOverride,
}: {
  leaveRequestId: string;
  startDate: string;
  endDate: string;
  coverOverride?: boolean;
}) {
  const [check, setCheck] = useState<CoverCheckResult | null>(null);
  const [days, setDays] = useState<DailyCover[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const checkRes = await fetch(
          `/api/leave-requests/${leaveRequestId}/check-cover`,
          { method: "POST" }
        );
        if (!checkRes.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const checkData: CoverCheckResult = await checkRes.json();
        if (cancelled) return;
        setCheck(checkData);

        if (checkData.regionId) {
          const start = startDate.slice(0, 10);
          const end = endDate.slice(0, 10);
          const rangeRes = await fetch(
            `/api/regions/${checkData.regionId}/cover/range?start=${start}&end=${end}`
          );
          if (rangeRes.ok && !cancelled) {
            const rangeData = await rangeRes.json();
            setDays(rangeData.days ?? []);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [leaveRequestId, startDate, endDate]);

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Loading regional cover…
      </div>
    );
  }

  if (!check || !check.regionId) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
        <p className="font-medium text-gray-700">No region assigned</p>
        <p className="mt-0.5">
          This requester isn&apos;t in a region, so cover is not tracked for
          their absences.
        </p>
      </div>
    );
  }

  const workingDays = days.filter((d) => !d.isWeekend && !d.isBankHoliday);
  const coverState = check.hasConflict ? "conflict" : "ok";

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-white px-3 py-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <MapPin className="h-3.5 w-3.5 text-gray-500" />
          {check.regionName}
          <span className="text-xs font-normal text-gray-500">
            min cover {check.minCover}
          </span>
        </div>
        {coverState === "ok" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <ShieldCheck className="h-3 w-3" />
            Cover OK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            <AlertTriangle className="h-3 w-3" />
            Below minimum
          </span>
        )}
      </div>

      {coverOverride && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          Cover override applied — recorded in the audit log.
        </div>
      )}

      {workingDays.length === 0 ? (
        <p className="text-gray-500">
          No working days in this range (weekends/bank holidays only).
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {workingDays.map((d) => {
            const ok = d.available >= d.required;
            return (
              <li
                key={d.date}
                className="flex items-start justify-between gap-3 py-1.5"
              >
                <div>
                  <p className="text-gray-700">{formatDay(d.date)}</p>
                  {d.staffOff.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Off: {d.staffOff.map((s) => s.name).join(", ")}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    ok
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {d.available}/{d.required}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

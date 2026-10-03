"use client";

import { useEffect, useState } from "react";
import { Hand } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Row = {
  offerId: string;
  userName: string;
  date: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  hours: number;
  locationName: string;
  coveringFor: string | null;
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Extra shifts people worked by accepting cover requests, for the same period
 * as the payroll export. Paid work, so payroll needs it alongside the leave.
 */
export function CoverShiftsSection({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<{ rows: Row[]; totals: { shifts: number; hours: number } } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`/api/reports/cover-shifts?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && (setData(d), setError(false)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const exportHref = (format: "csv" | "excel") => {
    const qs = new URLSearchParams({ format });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return `/api/reports/cover-shifts?${qs}`;
  };
  const empty = !data || data.rows.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hand className="h-4 w-4 text-gray-500" />
              Cover shifts worked
            </CardTitle>
            <CardDescription>
              Extra shifts people took on by accepting a cover request in this
              period, on top of their usual pattern. Send these to payroll with
              the leave export.
            </CardDescription>
          </div>
          <div className="flex gap-2 text-sm">
            {(["csv", "excel"] as const).map((f) => (
              <a
                key={f}
                href={empty ? undefined : exportHref(f)}
                aria-disabled={empty}
                className={`rounded-md border px-2.5 py-1 font-medium ${
                  empty ? "pointer-events-none border-gray-200 text-gray-300" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {f === "csv" ? "CSV" : "Excel"}
              </a>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-700">Couldn&apos;t load cover shifts.</p>}
        {!error && !data && <p className="text-sm text-gray-500">Loading…</p>}
        {data && data.rows.length === 0 && (
          <p className="text-sm text-gray-500">No cover shifts accepted in this period.</p>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Shift</th>
                  <th className="pb-2 pr-4">Location</th>
                  <th className="pb-2 pr-4">Covering for</th>
                  <th className="pb-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.offerId} className="border-b border-gray-50">
                    <td className="py-2 pr-4 text-gray-900">{r.userName}</td>
                    <td className="py-2 pr-4 text-gray-600">{DAY.format(new Date(`${r.date}T00:00:00Z`))}</td>
                    <td className="py-2 pr-4 text-gray-600">
                      {r.shiftName} · {r.startTime}–{r.endTime}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{r.locationName}</td>
                    <td className="py-2 pr-4 text-gray-600">{r.coveringFor ?? "—"}</td>
                    <td className="py-2 text-right font-mono text-gray-700">{r.hours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">
              {data.totals.shifts} shift{data.totals.shifts === 1 ? "" : "s"}, {data.totals.hours}h in total.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

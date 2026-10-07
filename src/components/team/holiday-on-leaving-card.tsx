"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatGBP } from "@/lib/money";
import type { HolidayOnLeavingReport } from "@/lib/holiday-on-leaving-server";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Holiday on leaving on a leaver's profile: what they built up by their last
 * day, took and are owed (pay in lieu), or took over (src/lib/holiday-on-leaving.ts).
 */
export function HolidayOnLeavingCard({ memberId }: { memberId: string }) {
  const [report, setReport] = useState<HolidayOnLeavingReport | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/team-members/${memberId}/holiday-on-leaving`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setReport)
      .catch(() => setError(true));
  }, [memberId]);

  if (error) return null;
  const n = (v: number) => `${Number(v.toFixed(2))} ${report?.unit === "hours" ? "hours" : v === 1 ? "day" : "days"}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Holiday on leaving</CardTitle>
        <CardDescription>
          Untaken holiday built up by their last day has to be paid in their final pay, even if they
          were dismissed. If they took more than they built up, you can only take it back if that
          was agreed in writing beforehand.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-gray-700">
        {!report ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1 text-gray-500">
                    Built up in {report.leaveYear} by {fmt(report.lastDay)}
                  </td>
                  <td className="py-1 text-right font-mono">{n(report.accrued)}</td>
                </tr>
                {report.unit === "days" && (
                  <tr>
                    <td className="py-1 pl-3 text-xs text-gray-400" colSpan={2}>
                      {n(report.yearEntitlement)} for the year × {Math.round(report.proportion * 1000) / 10}% of it worked
                      {report.bankHolidaysOnTop
                        ? ` (includes ${report.bankHolidaysOnTop.inYear} bank holidays given on top)`
                        : ""}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-1 text-gray-500">Carried over from earlier years and still owed</td>
                  <td className="py-1 text-right font-mono">
                    {report.carriedOver > 0 ? `+ ${n(report.carriedOver)}` : "none"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-gray-500">
                    Taken{report.bankHolidaysOnTop ? ` (with ${report.bankHolidaysOnTop.byLastDay} bank holidays)` : ""}
                  </td>
                  <td className="py-1 text-right font-mono">− {n(report.taken)}</td>
                </tr>
                <tr className="border-t border-gray-100 font-semibold text-gray-900">
                  <td className="py-1">{report.owed >= 0 ? "To pay" : "Taken over"}</td>
                  <td className="py-1 text-right font-mono">{n(Math.abs(report.owed))}</td>
                </tr>
              </tbody>
            </table>
            {report.owed > 0 && (
              <p>
                {report.pay !== null && report.rate !== null ? (
                  <>
                    About <strong>{formatGBP(report.pay)}</strong> at their 52-week average of{" "}
                    {formatGBP(report.rate)} a {report.unit === "hours" ? "hour" : "day"}.
                  </>
                ) : (
                  "Add their earnings to work out the pay (52-week average holiday pay)."
                )}
              </p>
            )}
            {report.pending > 0 && (
              <p className="text-xs text-amber-700">
                {n(report.pending)} still waiting for approval before their last day {report.pending === 1 ? "isn't" : "aren't"}{" "}
                counted as taken.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

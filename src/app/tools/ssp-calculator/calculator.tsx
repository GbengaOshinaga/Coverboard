"use client";

import { useState } from "react";
import {
  UK_SSP_WEEKLY_RATE,
  SSP_MAX_WEEKS,
  calculateSspWeeklyRate,
  calculateSspDailyRate,
} from "@/lib/uk-compliance";

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function SspCalculator() {
  const [awe, setAwe] = useState("250");
  const [qualifyingDays, setQualifyingDays] = useState("5");
  const [sickDays, setSickDays] = useState("5");

  const aweNum = num(awe);
  const qDays = Math.min(7, Math.max(1, Math.round(num(qualifyingDays) || 5)));

  // The exact functions Coverboard uses in-product, so the tool and the app
  // always agree. Post-6-April-2026 rules: no waiting days, no Lower Earnings
  // Limit, rate capped at 80% of average weekly earnings.
  const weeklyRate = calculateSspWeeklyRate(aweNum > 0 ? aweNum : null);
  const dailyRate = calculateSspDailyRate(qDays, weeklyRate);
  const maxDays = SSP_MAX_WEEKS * qDays;
  const payableDays = Math.min(Math.round(num(sickDays)), maxDays);
  const total = Number((dailyRate * payableDays).toFixed(2));
  const usesPercentage = aweNum > 0 && weeklyRate < UK_SSP_WEEKLY_RATE;

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
  const labelClass = "block text-sm font-medium text-gray-700";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="awe" className={labelClass}>
            Average weekly earnings (£)
          </label>
          <input
            id="awe"
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={awe}
            onChange={(e) => setAwe(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-gray-400">
            Gross weekly pay, averaged over the 8 weeks before the sickness.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="qualifyingDays" className={labelClass}>
            Working (qualifying) days per week
          </label>
          <input
            id="qualifyingDays"
            type="number"
            min="1"
            max="7"
            step="1"
            inputMode="numeric"
            value={qualifyingDays}
            onChange={(e) => setQualifyingDays(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="sickDays" className={labelClass}>
            Working days off sick
          </label>
          <input
            id="sickDays"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={sickDays}
            onChange={(e) => setSickDays(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-gray-400">
            Qualifying days the employee is off — SSP is paid from the first day
            (no waiting days from 6 April 2026).
          </p>
        </div>
      </div>

      {/* Result */}
      <div className="mt-6 rounded-lg border border-brand-100 bg-brand-50 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-gray-600">Weekly SSP</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              £{weeklyRate.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Daily SSP</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              £{dailyRate.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">
              Total ({payableDays} day{payableDays === 1 ? "" : "s"})
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              £{total.toFixed(2)}
            </p>
          </div>
        </div>
        <p className="mt-3 border-t border-brand-100 pt-3 text-xs leading-relaxed text-gray-600">
          {usesPercentage ? (
            <>
              Weekly rate = 80% of £{aweNum.toLocaleString("en-GB")} = £
              {weeklyRate.toFixed(2)} (lower than the £
              {UK_SSP_WEEKLY_RATE.toFixed(2)} flat rate).{" "}
            </>
          ) : (
            <>
              Weekly rate = the £{UK_SSP_WEEKLY_RATE.toFixed(2)} flat rate (80% of
              earnings would be higher).{" "}
            </>
          )}
          Daily = £{weeklyRate.toFixed(2)} ÷ {qDays} qualifying day
          {qDays === 1 ? "" : "s"} = £{dailyRate.toFixed(2)}. SSP is payable for
          up to {SSP_MAX_WEEKS} weeks per period of sickness.
        </p>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-gray-400">
        General information, not legal advice. Uses the rules in force from 6
        April 2026 and the 2026/27 flat rate (£{UK_SSP_WEEKLY_RATE.toFixed(2)}).
        Sickness that started before 6 April 2026 still has 3 unpaid waiting days.
      </p>
    </div>
  );
}

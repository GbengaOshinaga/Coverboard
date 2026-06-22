"use client";

import { useState } from "react";
import {
  calculateIrregularHoursAccrual,
  IRREGULAR_HOURS_ACCRUAL_RATE,
} from "@/lib/uk-compliance";

type Mode = "weekly" | "total";

const RATE_PCT = (IRREGULAR_HOURS_ACCRUAL_RATE * 100).toFixed(2);

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function IrregularHoursCalculator() {
  const [mode, setMode] = useState<Mode>("weekly");
  const [weeklyHours, setWeeklyHours] = useState("20");
  const [weeks, setWeeks] = useState("52");
  const [totalHours, setTotalHours] = useState("520");
  const [avgDay, setAvgDay] = useState("7.5");

  const hoursWorked =
    mode === "weekly" ? num(weeklyHours) * num(weeks) : num(totalHours);

  // The single source of truth: the exact function Coverboard uses in-product,
  // so this tool can never drift from how the app computes entitlement.
  const accruedHours = calculateIrregularHoursAccrual(hoursWorked);
  const dayLength = num(avgDay);
  const accruedDays = dayLength > 0 ? accruedHours / dayLength : 0;

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
  const labelClass = "block text-sm font-medium text-gray-700";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      {/* Mode toggle */}
      <div className="mb-5 inline-flex rounded-lg bg-gray-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("weekly")}
          className={`rounded-md px-3 py-1.5 font-medium transition ${
            mode === "weekly"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Estimate for a year
        </button>
        <button
          type="button"
          onClick={() => setMode("total")}
          className={`rounded-md px-3 py-1.5 font-medium transition ${
            mode === "total"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          From total hours worked
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "weekly" ? (
          <>
            <div className="space-y-1">
              <label htmlFor="weeklyHours" className={labelClass}>
                Average hours worked per week
              </label>
              <input
                id="weeklyHours"
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="weeks" className={labelClass}>
                Weeks worked in the year
              </label>
              <input
                id="weeks"
                type="number"
                min="0"
                max="52"
                step="1"
                inputMode="numeric"
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                className={inputClass}
              />
            </div>
          </>
        ) : (
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="totalHours" className={labelClass}>
              Total hours worked in the period
            </label>
            <input
              id="totalHours"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="avgDay" className={labelClass}>
            Average length of a working day (hours)
          </label>
          <input
            id="avgDay"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={avgDay}
            onChange={(e) => setAvgDay(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-gray-400">
            Only used to show the rough days equivalent. Holiday legally accrues
            in hours.
          </p>
        </div>
      </div>

      {/* Result */}
      <div className="mt-6 rounded-lg border border-brand-100 bg-brand-50 p-5">
        <p className="text-sm font-medium text-gray-600">Holiday accrued</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">
          {accruedHours.toFixed(1)}{" "}
          <span className="text-lg font-semibold text-gray-500">hours</span>
        </p>
        {dayLength > 0 && (
          <p className="mt-1 text-sm text-gray-600">
            ≈ {accruedDays.toFixed(1)} days at {dayLength}h per day
          </p>
        )}
        <p className="mt-3 border-t border-brand-100 pt-3 text-xs leading-relaxed text-gray-600">
          {RATE_PCT}% × {hoursWorked.toLocaleString("en-GB")} hours worked ={" "}
          {accruedHours.toFixed(1)} hours.{" "}
          {mode === "weekly" && (
            <>
              ({num(weeklyHours).toLocaleString("en-GB")} h/week ×{" "}
              {num(weeks)} weeks = {hoursWorked.toLocaleString("en-GB")} hours.){" "}
            </>
          )}
          For irregular-hours workers this accrual already includes bank
          holidays — there is no separate bank-holiday entitlement on top.
        </p>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-gray-400">
        General information, not legal advice. Figures use the statutory 12.07%
        method for leave years beginning on or after 1 April 2024 and assume the
        statutory minimum (5.6 weeks). Your contract may be more generous.
      </p>
    </div>
  );
}

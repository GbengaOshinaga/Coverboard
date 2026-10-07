"use client";

import { useState } from "react";
import { formatGBP } from "@/lib/money";
import {
  lastDayBefore,
  matchingWeek,
  maternityLeaveLatestEnd,
  qualifyingWeek,
  type BirthPayKind,
} from "@/lib/smp-dates";
import { UK_LEL_WEEKLY } from "@/lib/uk-compliance";

type Stored = string | number | null | undefined;
const num = (v: Stored) => (v === null || v === undefined ? null : Number(v));
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = formatGBP;

/**
 * Statutory Maternity Pay on a maternity request, or Statutory Adoption Pay
 * on an adoption one: the qualifying or matching week, the earnings it's
 * based on, the two rates, and how long the leave can last — or why there's
 * no pay. Shown from what's stored, which is recalculated when earnings change.
 */
export function SmpSummary({
  request,
  kind = "SMP",
  onChanged,
}: {
  kind?: BirthPayKind;
  /** After the due or matching date is added, so the card reloads. */
  onChanged?: () => void;
  request: {
    id: string;
    startDate: string;
    expectedDueDate?: string | null;
    matchedDate?: string | null;
    smpAverageWeeklyEarnings?: Stored;
    smpPhase1WeeklyRate?: Stored;
    smpPhase2WeeklyRate?: Stored;
    smpPhase1EndDate?: string | null;
    smpPhase2EndDate?: string | null;
    /** Weeks of the 8 with pay recorded (from the API). */
    smpEarningsWeeks?: number;
  };
}) {
  const weeks = request.smpEarningsWeeks;
  const missing = weeks !== undefined && weeks > 0 && weeks < 8 ? 8 - weeks : 0;
  const adoption = kind === "SAP";
  const [dateDraft, setDateDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function saveDate() {
    if (!dateDraft) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/leave-requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adoption ? { matchedDate: dateDraft } : { expectedDueDate: dateDraft }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save the date");
      return;
    }
    onChanged?.();
  }
  const due = !adoption && request.expectedDueDate ? new Date(request.expectedDueDate) : null;
  const matched = adoption && request.matchedDate ? new Date(request.matchedDate) : null;
  // The qualifying week (maternity) or matching week (adoption).
  const qw = due ? qualifyingWeek(due) : matched ? matchingWeek(matched) : null;
  const weekName = adoption ? "matching week" : "qualifying week";
  const noPayHelp = adoption
    ? "give them form SAP1 explaining why"
    : "they may get Maternity Allowance (form SMP1)";
  const awe = num(request.smpAverageWeeklyEarnings);
  const p1 = num(request.smpPhase1WeeklyRate);
  const p2 = num(request.smpPhase2WeeklyRate);
  const latestEnd = maternityLeaveLatestEnd(new Date(request.startDate));

  const reason =
    awe === null
      ? `no pay recorded in the 8 weeks up to ${qw ? `the ${weekName}` : "the leave start"}. Add their earnings and this updates`
      : awe < UK_LEL_WEEKLY
        ? `average earnings of ${money(awe)} are below the ${money(UK_LEL_WEEKLY)} Lower Earnings Limit; ${noPayHelp}`
        : `less than 26 weeks' service by the ${weekName}; ${noPayHelp}`;

  return (
    <div className="mt-2 rounded-md border border-purple-100 bg-purple-50/50 px-3 py-2 text-xs text-gray-700">
      <p className="font-medium text-gray-900">{adoption ? "Statutory Adoption Pay" : "Statutory Maternity Pay"}</p>
      {qw ? (
        <p>
          {adoption ? "Matching week" : "Qualifying week"} {fmt(qw.start)} – {fmt(qw.end)}
          {due ? ` (due ${fmt(due)})` : matched ? ` (told of the match ${fmt(matched)})` : ""}
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-amber-700">
            {adoption
              ? "No matching date recorded, so earnings are taken from before the leave starts. Add the date they were told of the match, from the matching certificate."
              : "No due date recorded, so earnings are taken from before the leave starts. Add the due date from the MATB1."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label={adoption ? "Date they were told of the match" : "Expected due date"}
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={!dateDraft || saving}
              onClick={saveDate}
              className="rounded border border-purple-200 bg-white px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
            >
              {saving ? "Saving…" : adoption ? "Add matching date" : "Add due date"}
            </button>
          </div>
          {error && <p className="text-red-700">{error}</p>}
        </div>
      )}
      {p1 !== null && p2 !== null ? (
        <>
          <p>
            Average weekly earnings {money(awe!)}: {money(p1)} a week (90%) for 6 weeks
            {request.smpPhase1EndDate ? `, to ${fmt(lastDayBefore(new Date(request.smpPhase1EndDate)))}` : ""}, then{" "}
            {money(p2)} a week for 33 weeks
            {request.smpPhase2EndDate ? `, to ${fmt(lastDayBefore(new Date(request.smpPhase2EndDate)))}` : ""}.
          </p>
          {missing > 0 && (
            <p className="text-amber-700">
              Based on {weeks} of the 8 weeks. The {missing} week{missing === 1 ? "" : "s"} with nothing
              recorded {missing === 1 ? "is" : "are"} treated as pay not entered yet. If they earned
              nothing then, mark {missing === 1 ? "it" : "them"} as no-pay weeks: the average would be{" "}
              {money((awe! * weeks!) / 8)}.
            </p>
          )}
        </>
      ) : (
        <p className="text-amber-700">
          No {kind}: {reason}.
        </p>
      )}
      <p className="text-gray-500">
        {adoption ? "Adoption" : "Maternity"} leave can last until {fmt(latestEnd)} (52 weeks: 26 ordinary + 26
        additional).
      </p>
    </div>
  );
}

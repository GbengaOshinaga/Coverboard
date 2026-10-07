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

type PayWeek = { name: string; start: string; end: string };

/** "Qualifying week 19 Jul – 25 Jul 2026" */
function WeekLine({ week }: { week?: PayWeek | null }) {
  if (!week) return null;
  const name = week.name.charAt(0).toUpperCase() + week.name.slice(1);
  return (
    <p>
      {name} {fmt(new Date(`${week.start}T00:00:00Z`))} – {fmt(new Date(`${week.end}T00:00:00Z`))}
    </p>
  );
}

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

/**
 * Shared Parental Pay on a shared parental leave request: the weekly rate
 * (lower of the flat rate and 90% of earnings), or why there's none, and
 * whether their notice claims pay for these weeks.
 */
export function ShppSummary({
  request,
  onChanged,
}: {
  onChanged?: () => void;
  request: {
    id: string;
    shpp?: {
      claimed: boolean;
      eligible: boolean;
      weeklyRate: number | null;
      basis: string;
      dateKnown: boolean;
      testWeek?: PayWeek | null;
      weeksLeft?: number | null;
    };
  };
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const shpp = request.shpp;
  if (!shpp) return null;

  async function setClaimed(claimed: boolean) {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/leave-requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shppClaimed: claimed }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save");
      return;
    }
    onChanged?.();
  }

  return (
    <div className="mt-2 rounded-md border border-purple-100 bg-purple-50/50 px-3 py-2 text-xs text-gray-700">
      <p className="font-medium text-gray-900">Shared Parental Pay</p>
      {!shpp.claimed ? (
        <p>Unpaid: their notice doesn&apos;t claim Shared Parental Pay for these weeks.</p>
      ) : shpp.weeklyRate !== null ? (
        <p>{shpp.basis}.</p>
      ) : (
        <p className="text-amber-700">No ShPP: {shpp.basis}</p>
      )}
      {shpp.claimed && <WeekLine week={shpp.testWeek} />}
      {shpp.claimed && shpp.weeksLeft != null && (
        <p>
          {shpp.weeksLeft} of 37 weeks of Shared Parental Pay left for this child after their bookings
          (less if the other parent claims some, or the mother or adopter used more than 2 weeks of
          maternity or adoption pay).
        </p>
      )}
      <button
        type="button"
        disabled={saving}
        onClick={() => setClaimed(!shpp.claimed)}
        className="mt-1 rounded border border-purple-200 bg-white px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
      >
        {saving ? "Saving…" : shpp.claimed ? "Mark these weeks as unpaid" : "Claiming ShPP for these weeks"}
      </button>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}

/**
 * Statutory Paternity Pay on a paternity leave request: the weekly rate and
 * how it was worked out, or why there's none. Without a due or matching
 * date, it can be added here.
 */
export function SppSummary({
  request,
  onChanged,
}: {
  onChanged?: () => void;
  request: {
    id: string;
    spp?: { eligible: boolean; weeklyRate: number | null; basis: string; dateKnown: boolean; testWeek?: PayWeek | null };
  };
}) {
  const [dateFor, setDateFor] = useState<"birth" | "adoption">("birth");
  const [dateDraft, setDateDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const spp = request.spp;
  if (!spp) return null;

  async function saveDate() {
    if (!dateDraft) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/leave-requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dateFor === "adoption" ? { matchedDate: dateDraft } : { expectedDueDate: dateDraft }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save the date");
      return;
    }
    onChanged?.();
  }

  return (
    <div className="mt-2 rounded-md border border-purple-100 bg-purple-50/50 px-3 py-2 text-xs text-gray-700">
      <p className="font-medium text-gray-900">Statutory Paternity Pay</p>
      <WeekLine week={spp.testWeek} />
      <p className={spp.weeklyRate === null ? "text-amber-700" : undefined}>
        {spp.weeklyRate === null ? `No SPP: ${spp.basis}` : `${spp.basis}.`}
      </p>
      {!spp.dateKnown && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <select
            aria-label="Birth or adoption"
            value={dateFor}
            onChange={(e) => setDateFor(e.target.value as "birth" | "adoption")}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value="birth">Due date</option>
            <option value="adoption">Matching date (adoption)</option>
          </select>
          <input
            type="date"
            aria-label={dateFor === "adoption" ? "Date they were told of the match" : "Baby's due date"}
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
            {saving ? "Saving…" : "Add date"}
          </button>
        </div>
      )}
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}

/**
 * Statutory Neonatal Care Pay on a neonatal care leave request: the weekly
 * rate and which week it came from, the weeks of leave the time in care
 * gives, and (while the baby is still in care) a place to add the last day.
 */
export function NeonatalSummary({
  request,
  onChanged,
}: {
  onChanged?: () => void;
  request: {
    id: string;
    neonatal?: {
      eligible: boolean;
      weeklyRate: number | null;
      basis: string;
      weeksEntitled: number;
      daysInCare: number;
      stillInCare: boolean;
    };
  };
}) {
  const [lastDay, setLastDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const n = request.neonatal;
  if (!n) return null;

  async function saveLastDay() {
    if (!lastDay) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/leave-requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ neonatalCareLastDay: lastDay }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save the date");
      return;
    }
    onChanged?.();
  }

  return (
    <div className="mt-2 rounded-md border border-purple-100 bg-purple-50/50 px-3 py-2 text-xs text-gray-700">
      <p className="font-medium text-gray-900">Neonatal Care Pay</p>
      <p className={n.weeklyRate === null ? "text-amber-700" : undefined}>
        {n.weeklyRate === null ? `No neonatal care pay: ${n.basis}` : `${n.basis}.`}
      </p>
      <p>
        {n.daysInCare} full day{n.daysInCare === 1 ? "" : "s"} in neonatal care
        {n.stillInCare ? " so far" : ""}: {n.weeksEntitled} week{n.weeksEntitled === 1 ? "" : "s"} of leave and pay
        {n.weeksEntitled === 12 ? " (the most)" : ""}.
      </p>
      {n.stillInCare && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Last full day in neonatal care"
            value={lastDay}
            onChange={(e) => setLastDay(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={!lastDay || saving}
            onClick={saveLastDay}
            className="rounded border border-purple-200 bg-white px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add last day in care"}
          </button>
        </div>
      )}
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}

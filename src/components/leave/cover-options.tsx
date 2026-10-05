"use client";

import { useState } from "react";
import type { CoverCandidate, CoverOfferSummary, RuledOutMember } from "@/lib/shiftCover";

const CONTRACT_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  VARIABLE_HOURS: "Variable hours",
  ZERO_HOURS: "Zero-hours",
};

const MAX_RULED_OUT = 3;

/**
 * Covering would take them past 48 hours that week. The legal limit is a
 * 17-week average and people can opt out, so it's a check, not a bar.
 */
export function over48Label(hoursIfCovered: number): string {
  return `Would be ${hoursIfCovered}h this week (over 48) — check their average and any opt-out`;
}

/** Scheduled (from their working pattern) in the week of the short shift. */
function weekHoursLabel(hours: number): string {
  if (hours === 0) return "No shifts this week";
  return `${hours}h this week`;
}

/**
 * Who could cover a short shift, and who can't and why. Candidates follow the
 * engine's rules (not on the shift, not on leave, 11h rest).
 *
 * With `shiftId` and `date`, each candidate gets an Ask button: it sends them
 * a cover request they accept or decline in the app.
 */
export function CoverOptions({
  candidates,
  ruledOut,
  shiftId,
  date,
  offers: initialOffers = [],
  leaveRequestId,
}: {
  candidates: CoverCandidate[];
  ruledOut: RuledOutMember[];
  shiftId?: string | null;
  /** YYYY-MM-DD */
  date?: string;
  offers?: CoverOfferSummary[];
  leaveRequestId?: string;
}) {
  const [offers, setOffers] = useState(initialOffers);
  const [busy, setBusy] = useState<string | null>(null);
  // Taking someone off an accepted shift emails them, so it takes a second click.
  const [confirmPull, setConfirmPull] = useState<string | null>(null);
  const [error, setError] = useState("");
  const canAsk = !!shiftId && !!date;

  if (candidates.length === 0 && ruledOut.length === 0) return null;
  const hidden = ruledOut.length - MAX_RULED_OUT;
  const offerFor = (userId: string) =>
    [...offers].reverse().find((o) => o.userId === userId) ?? null;

  async function ask(userId: string) {
    setBusy(userId);
    setError("");
    try {
      const res = await fetch("/api/cover-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftTypeId: shiftId, date, userId, leaveRequestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't send the request");
        return;
      }
      setOffers((prev) => [...prev, { id: data.id, userId, status: "PENDING" }]);
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(offerId: string) {
    setBusy(offerId);
    setError("");
    try {
      const res = await fetch(`/api/cover-offers/${offerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't withdraw the request");
        return;
      }
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
    } finally {
      setBusy(null);
    }
  }

  function candidateAction(userId: string) {
    const offer = offerFor(userId);
    if (offer?.status === "PENDING") {
      return (
        <span className="flex shrink-0 items-center gap-2 text-[11px]">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">Asked</span>
          <button
            type="button"
            onClick={() => withdraw(offer.id)}
            disabled={busy === offer.id}
            className="text-gray-500 hover:text-gray-800"
          >
            Withdraw
          </button>
        </span>
      );
    }
    if (offer?.status === "ACCEPTED") {
      return (
        <span className="flex shrink-0 items-center gap-2 text-[11px]">
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">Covering</span>
          <button
            type="button"
            onClick={() => (confirmPull === offer.id ? withdraw(offer.id) : setConfirmPull(offer.id))}
            disabled={busy === offer.id}
            className={confirmPull === offer.id ? "font-medium text-red-700" : "text-gray-500 hover:text-gray-800"}
          >
            {confirmPull === offer.id ? "Take them off? (emails them)" : "Withdraw"}
          </button>
        </span>
      );
    }
    if (offer?.status === "DECLINED") {
      return (
        <span className="shrink-0 rounded bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
          Declined
        </span>
      );
    }
    if (canAsk) {
      return (
        <button
          type="button"
          onClick={() => ask(userId)}
          disabled={busy === userId}
          className="shrink-0 rounded-md border border-brand-600 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          {busy === userId ? "Asking…" : "Ask"}
        </button>
      );
    }
    return (
      <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
        Free
      </span>
    );
  }

  return (
    <div className="mt-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-gray-900">
      <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {candidates.length > 0 ? "Could cover" : "No one free to cover"}
      </p>
      <ul className="divide-y divide-gray-100">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-xs text-gray-500">
                {[
                  c.employmentType ? CONTRACT_LABELS[c.employmentType] : null,
                  weekHoursLabel(c.weekHours),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {c.hoursIfCovered !== undefined && (
                <p className="text-xs font-medium text-amber-700">
                  {over48Label(c.hoursIfCovered)}
                </p>
              )}
            </div>
            {candidateAction(c.id)}
          </li>
        ))}
        {ruledOut.slice(0, MAX_RULED_OUT).map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <p className="text-sm text-gray-400 line-through">{o.name}</p>
              {o.note && <p className="truncate text-xs text-gray-500">{o.note}</p>}
            </div>
            <span className="shrink-0 rounded bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
              {o.reason === "rest" ? (o.coverClash ? "Already covering" : "Needs 11h rest") : "On leave"}
            </span>
          </li>
        ))}
      </ul>
      {canAsk && candidates.length > 0 && (
        <p className="pb-1 text-[11px] text-gray-500">
          Ask sends them a request to accept or decline. The first to accept
          takes the shift.
        </p>
      )}
      {error && <p className="pb-1 text-xs text-red-700">{error}</p>}
      {hidden > 0 && (
        <p className="pb-1 text-xs text-gray-500">
          …and {hidden} more who can&apos;t cover.
        </p>
      )}
    </div>
  );
}

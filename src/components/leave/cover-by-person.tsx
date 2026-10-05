"use client";

import { useMemo, useState } from "react";
import { groupCoverByPerson, type ShortShift } from "@/lib/cover-grouping";
import type { CoverOfferSummary } from "@/lib/shiftCover";
import { over48Label } from "@/components/leave/cover-options";

const CONTRACT_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  VARIABLE_HOURS: "Variable hours",
  ZERO_HOURS: "Zero-hours",
};

const FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return FMT.format(new Date(y, m - 1, d));
}

const keyOf = (shiftId: string | null, date: string, userId: string) => `${shiftId}|${date}|${userId}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The cover picture for several short shifts at once, grouped by person:
 * every short shift on one line, then each person who could help with the
 * shifts they could take (and an Ask button for each, or all), then who
 * can't and why. Used instead of a per-shift list once more than one shift
 * is short, so a long absence doesn't repeat everyone under every shift.
 */
export function CoverByPerson({
  conflicts,
  leaveRequestId,
}: {
  conflicts: ShortShift[];
  leaveRequestId?: string;
}) {
  const grouped = useMemo(() => groupCoverByPerson(conflicts), [conflicts]);
  const canCoverSome = useMemo(() => new Set(grouped.people.map((p) => p.id)), [grouped]);
  const [offers, setOffers] = useState<Map<string, CoverOfferSummary>>(() => {
    const m = new Map<string, CoverOfferSummary>();
    for (const p of grouped.people) {
      for (const o of p.options) if (o.offer) m.set(keyOf(o.shiftId, o.date, p.id), o.offer);
    }
    return m;
  });
  const [busy, setBusy] = useState<string | null>(null);
  // Taking someone off an accepted shift emails them, so it takes a second click.
  const [confirmPull, setConfirmPull] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function ask(shiftId: string | null, date: string, userId: string): Promise<boolean> {
    const res = await fetch("/api/cover-offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shiftTypeId: shiftId, date, userId, leaveRequestId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(`${formatDay(date)}: ${data.error || "couldn't send the request"}`);
      return false;
    }
    setOffers((prev) => new Map(prev).set(keyOf(shiftId, date, userId), { id: data.id, userId, status: "PENDING" }));
    return true;
  }

  async function askOne(shiftId: string | null, date: string, userId: string) {
    const k = keyOf(shiftId, date, userId);
    setBusy(k);
    setError("");
    try {
      await ask(shiftId, date, userId);
    } finally {
      setBusy(null);
    }
  }

  async function askAll(personId: string) {
    const person = grouped.people.find((p) => p.id === personId);
    if (!person) return;
    const toAsk = person.options.filter((o) => o.shiftId && !offers.has(keyOf(o.shiftId, o.date, personId)));
    if (toAsk.length === 0) return;
    setBusy(`all:${personId}`);
    setError("");
    try {
      // One request, so they get one email listing every shift.
      const res = await fetch("/api/cover-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: personId,
          shifts: toAsk.map((o) => ({ shiftTypeId: o.shiftId, date: o.date })),
          leaveRequestId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const results: Array<{ shiftTypeId: string; date: string; ok: boolean; offerId?: string; error?: string }> =
        data.results ?? [];
      setOffers((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r.ok && r.offerId) next.set(keyOf(r.shiftTypeId, r.date, personId), { id: r.offerId, userId: personId, status: "PENDING" });
        }
        return next;
      });
      const failed = results.filter((r) => !r.ok);
      if (!res.ok && results.length === 0) setError(data.error || "Couldn't send the requests");
      else if (failed.length > 0) {
        setError(failed.map((r) => `${formatDay(r.date)}: ${r.error}`).join(" · "));
      }
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(shiftId: string | null, date: string, userId: string, offerId: string) {
    const k = keyOf(shiftId, date, userId);
    setBusy(k);
    setError("");
    try {
      const res = await fetch(`/api/cover-offers/${offerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't withdraw the request");
        return;
      }
      setOffers((prev) => {
        const next = new Map(prev);
        next.delete(k);
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  function action(shiftId: string | null, date: string, userId: string) {
    const k = keyOf(shiftId, date, userId);
    const offer = offers.get(k);
    if (offer?.status === "PENDING") {
      return (
        <span className="flex shrink-0 items-center gap-2 text-[11px]">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">Asked</span>
          <button
            type="button"
            onClick={() => withdraw(shiftId, date, userId, offer.id)}
            disabled={busy === k}
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
            onClick={() =>
              confirmPull === offer.id ? withdraw(shiftId, date, userId, offer.id) : setConfirmPull(offer.id)
            }
            disabled={busy === k}
            className={confirmPull === offer.id ? "font-medium text-red-700" : "text-gray-500 hover:text-gray-800"}
          >
            {confirmPull === offer.id ? "Take them off? (emails them)" : "Withdraw"}
          </button>
        </span>
      );
    }
    if (offer?.status === "DECLINED") {
      return <span className="shrink-0 rounded bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">Declined</span>;
    }
    if (!shiftId) return null;
    return (
      <button
        type="button"
        onClick={() => askOne(shiftId, date, userId)}
        disabled={busy !== null}
        className="shrink-0 rounded-md border border-brand-600 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      >
        {busy === k ? "Asking…" : "Ask"}
      </button>
    );
  }

  return (
    <div className="space-y-2.5 text-gray-900">
      <ul className="flex flex-wrap gap-1.5">
        {grouped.shifts.map((s) => (
          <li
            key={`${s.date}:${s.shiftId ?? ""}`}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              s.noOneFree ? "bg-red-50 text-red-700" : "bg-white text-amber-900 ring-1 ring-amber-200"
            }`}
            title={s.noOneFree ? "No one is free to cover this shift" : undefined}
          >
            {formatDay(s.date)}
            {s.shiftName ? ` · ${s.shiftName}` : ""} {s.available}/{s.required}
            {s.noOneFree ? " · no one free" : ""}
          </li>
        ))}
      </ul>

      {grouped.people.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1">
          <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Could cover</p>
          <ul className="divide-y divide-gray-100">
            {grouped.people.map((p) => {
              const askable = p.options.filter((o) => o.shiftId && !offers.has(keyOf(o.shiftId, o.date, p.id)));
              return (
                <li key={p.id} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-gray-500">
                        {p.employmentType && CONTRACT_LABELS[p.employmentType] ? ` · ${CONTRACT_LABELS[p.employmentType]}` : ""}
                        {` · could cover ${plural(p.options.length, "shift")}`}
                      </span>
                    </p>
                    {askable.length > 1 && (
                      <button
                        type="button"
                        onClick={() => askAll(p.id)}
                        disabled={busy !== null}
                        className="shrink-0 rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {busy === `all:${p.id}` ? "Asking…" : `Ask for all ${askable.length}`}
                      </button>
                    )}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {p.options.map((o) => (
                      <li key={`${o.date}:${o.shiftId}`} className="flex items-center justify-between gap-3 text-xs text-gray-600">
                        <span>
                          {formatDay(o.date)}
                          {o.shiftName ? ` · ${o.shiftName}` : ""}
                          <span className="text-gray-400">
                            {" · "}
                            {o.weekHours === 0 ? "no shifts that week" : `${o.weekHours}h that week`}
                          </span>
                          {o.hoursIfCovered !== undefined && (
                            <span className="block font-medium text-amber-700">
                              {over48Label(o.hoursIfCovered)}
                            </span>
                          )}
                        </span>
                        {action(o.shiftId, o.date, p.id)}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <p className="pb-1 text-[11px] text-gray-500">
            Ask sends a request to accept or decline. The first to accept a shift takes it.
          </p>
        </div>
      )}

      {grouped.ruledOut.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Can&apos;t cover</p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-gray-600">
            {grouped.ruledOut.map((p) => {
              // Someone free for other shifts isn't "out" — just not for these.
              const partly = canCoverSome.has(p.id);
              const other = partly ? "the other " : "";
              return (
                <li key={p.id}>
                  <span className={partly ? "text-gray-700" : "text-gray-400 line-through"}>{p.name}</span>
                  {" — "}
                  {[
                    p.coverShifts > 0
                      ? `already covering a nearby shift, so not ${other}${plural(p.coverShifts, "shift")}`
                      : null,
                    p.restShifts - p.coverShifts > 0
                      ? `needs 11h rest on ${other}${plural(p.restShifts - p.coverShifts, "shift")}`
                      : null,
                    p.leaveShifts > 0 ? `on leave for ${other}${plural(p.leaveShifts, "shift")}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

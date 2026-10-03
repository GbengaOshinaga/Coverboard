"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Offer = {
  id: string;
  date: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "FILLED" | "WITHDRAWN";
  offeredBy: string | null;
  shiftName: string;
  startTime: string;
  endTime: string;
  locationName: string;
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fmtDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));

const STATUS: Record<Offer["status"], { label: string; cls: string }> = {
  PENDING: { label: "Waiting for you", cls: "bg-amber-50 text-amber-800" },
  ACCEPTED: { label: "You're covering", cls: "bg-emerald-50 text-emerald-700" },
  DECLINED: { label: "Declined", cls: "bg-gray-100 text-gray-600" },
  CANCELLED: { label: "Withdrawn by your manager", cls: "bg-gray-100 text-gray-600" },
  FILLED: { label: "Covered by someone else", cls: "bg-gray-100 text-gray-600" },
  WITHDRAWN: { label: "You dropped out", cls: "bg-gray-100 text-gray-600" },
};

const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

export function CoverRequestsList() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/cover-offers");
    setOffers(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(id: string, accept: boolean) {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/cover-offers/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ id, text: data.error || "Something went wrong", tone: "error" });
      } else if (data.status === "FILLED") {
        setMessage({ id, text: "Thanks — someone else has already covered this shift.", tone: "ok" });
      } else if (data.status === "ACCEPTED") {
        setMessage({ id, text: "Thanks — you're on the shift. Your manager has been told.", tone: "ok" });
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function dropOut(id: string) {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/cover-offers/${id}/drop-out`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMessage(
        res.ok
          ? { id, text: "You're off this shift. Your manager has been told.", tone: "ok" }
          : { id, text: data.error || "Something went wrong", tone: "error" }
      );
      setConfirmDrop(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (offers === null) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (offers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
        No cover requests right now. When a manager asks you to cover a shift,
        it&apos;ll appear here and you&apos;ll get an email.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {offers.map((o) => (
        <li key={o.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900">
                {o.shiftName} shift · {fmtDay(o.date)}
              </p>
              <p className="text-sm text-gray-500">
                {o.startTime}–{o.endTime} · {o.locationName}
                {o.offeredBy ? ` · asked by ${o.offeredBy}` : ""}
              </p>
            </div>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[o.status].cls}`}>
              {STATUS[o.status].label}
            </span>
          </div>
          {o.status === "PENDING" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => respond(o.id, true)} disabled={busy === o.id}>
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => respond(o.id, false)} disabled={busy === o.id}>
                Decline
              </Button>
            </div>
          )}
          {o.status === "ACCEPTED" && o.date >= todayIso() && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {confirmDrop === o.id ? (
                <>
                  <span className="text-gray-700">Drop out? Your manager will be told the shift is short again.</span>
                  <Button size="sm" variant="destructive" onClick={() => dropOut(o.id)} disabled={busy === o.id}>
                    Yes, drop out
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDrop(null)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDrop(o.id)}
                  className="font-medium text-gray-600 hover:text-gray-900"
                >
                  Can&apos;t make it any more?
                </button>
              )}
            </div>
          )}
          {message?.id === o.id && (
            <p className={`mt-2 text-sm ${message.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>
              {message.text}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

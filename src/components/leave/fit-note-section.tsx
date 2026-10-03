"use client";

import { useState } from "react";
import { FileCheck2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fitNoteStatus } from "@/lib/fit-notes";

export type FitNoteRow = {
  id: string;
  coversFrom: string;
  coversTo: string;
  receivedOn: string;
};

const FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (iso: string | Date) => FMT.format(typeof iso === "string" ? new Date(iso) : iso);
const iso = (d: string | Date) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);

function todayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/**
 * Fit-note status and recording for one sickness absence (managers). Dates
 * only: no document upload and no medical details.
 */
export function FitNoteSection({
  requestId,
  startDate,
  endDate,
  fitNotes,
  onChanged,
}: {
  requestId: string;
  startDate: string;
  endDate: string;
  fitNotes: FitNoteRow[];
  onChanged?: () => void;
}) {
  const status = fitNoteStatus(
    { startDate: new Date(startDate), endDate: new Date(endDate) },
    fitNotes.map((n) => ({ coversFrom: new Date(n.coversFrom), coversTo: new Date(n.coversTo) }))
  );
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [received, setReceived] = useState(todayIso);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!status.required && fitNotes.length === 0) {
    return (
      <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
        <FileCheck2 className="h-3.5 w-3.5" />
        Self-certified: no fit note needed for 7 days or fewer.
      </p>
    );
  }

  function openForm() {
    const neededFrom = status.required ? status.neededFrom ?? status.requiredFrom : new Date(startDate);
    setFrom(iso(neededFrom));
    setTo(iso(endDate));
    setReceived(todayIso());
    setError("");
    setAdding(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/leave-requests/${requestId}/fit-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coversFrom: from, coversTo: to, receivedOn: received }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't record the fit note");
        return;
      }
      setAdding(false);
      onChanged?.();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError("");
    const res = await fetch(`/api/leave-requests/${requestId}/fit-notes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't remove the fit note");
      return;
    }
    onChanged?.();
  }

  const badge = !status.required
    ? null
    : status.fullyCovered
      ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">Covered</span>
      : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
          Needed from {fmt(status.neededFrom!)}
        </span>;

  return (
    <div className="mt-2 rounded-md border border-gray-200 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <FileCheck2 className="h-3.5 w-3.5 text-gray-500" />
        <span className="font-medium text-gray-700">Fit note</span>
        {badge}
        {!adding && (
          <button
            type="button"
            onClick={openForm}
            className="ml-auto font-medium text-brand-600 hover:text-brand-700"
          >
            Record fit note
          </button>
        )}
      </div>

      {fitNotes.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {fitNotes.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-2 text-gray-600">
              <span>
                Covers {fmt(n.coversFrom)} – {fmt(n.coversTo)} · received {fmt(n.receivedOn)}
              </span>
              <button
                type="button"
                onClick={() => remove(n.id)}
                className="text-gray-400 hover:text-red-600"
                aria-label="Remove fit note"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            {[
              { id: "from", label: "Covers from", value: from, set: setFrom },
              { id: "to", label: "Covers to", value: to, set: setTo },
              { id: "received", label: "Received", value: received, set: setReceived },
            ].map((f) => (
              <label key={f.id} className="block text-gray-700">
                <span className="block text-[11px] font-medium">{f.label}</span>
                <input
                  type="date"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="mt-0.5 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
            ))}
            <Button size="sm" onClick={save} disabled={saving || !from || !to || !received}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-gray-500">
            Record the dates only. Don&apos;t add the diagnosis or upload the note.
          </p>
        </div>
      )}
      {error && <p className="mt-1.5 text-red-700">{error}</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { WEEKDAY_LABELS } from "@/lib/shiftCover";

type Shift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  minCoverByWeekday: number[];
  patternCount: number;
};

type FormState = {
  name: string;
  startTime: string;
  endTime: string;
  mins: string[];
};

const EMPTY_FORM: FormState = {
  name: "",
  startTime: "08:00",
  endTime: "20:00",
  mins: ["1", "1", "1", "1", "1", "1", "1"],
};

function formFromShift(s: Shift): FormState {
  return {
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    mins: s.minCoverByWeekday.map(String),
  };
}

function overnight(s: { startTime: string; endTime: string }) {
  return s.endTime <= s.startTime;
}

export function RegionShiftsDialog({
  region,
  canManage,
  onClose,
  onChanged,
}: {
  region: { id: string; name: string } | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!region) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/regions/${region.id}/shifts`);
      if (res.ok) setShifts(await res.json());
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => {
    setEditingId(null);
    setConfirmDeleteId(null);
    load();
  }, [load]);

  function startAdd() {
    setForm(EMPTY_FORM);
    setEditingId("new");
  }

  function startEdit(s: Shift) {
    setForm(formFromShift(s));
    setEditingId(s.id);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!region || !editingId) return;
    const mins = form.mins.map((m) => parseInt(m, 10));
    if (mins.some((m) => isNaN(m) || m < 0)) {
      toast("Minimums must be 0 or more", "error");
      return;
    }
    setSaving(true);
    try {
      const url =
        editingId === "new"
          ? `/api/regions/${region.id}/shifts`
          : `/api/regions/${region.id}/shifts/${editingId}`;
      const res = await fetch(url, {
        method: editingId === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          startTime: form.startTime,
          endTime: form.endTime,
          minCoverByWeekday: mins,
        }),
      });
      if (res.ok) {
        toast(editingId === "new" ? "Shift added" : "Shift updated", "success");
        setEditingId(null);
        await load();
        onChanged();
      } else {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Failed to save shift", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!region) return;
    const res = await fetch(`/api/regions/${region.id}/shifts/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast("Shift deleted", "success");
      setConfirmDeleteId(null);
      await load();
      onChanged();
    } else {
      const data = await res.json().catch(() => null);
      toast(data?.error ?? "Failed to delete shift", "error");
    }
  }

  return (
    <Dialog
      open={!!region}
      onClose={onClose}
      title={region ? `Shifts · ${region.name}` : "Shifts"}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          With shifts, cover is checked per shift using each person&apos;s
          working pattern, instead of one minimum for the whole day. Set a
          minimum of 0 on days a shift doesn&apos;t run.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Loading shifts…</p>
        ) : shifts.length === 0 && editingId !== "new" ? (
          <p className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
            No shifts yet. This region uses its single daily minimum.
          </p>
        ) : (
          <ul className="space-y-2">
            {shifts.map((s) => (
              <li key={s.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500">
                      {s.startTime}–{s.endTime}
                      {overnight(s) && " (next day)"} · {s.patternCount} pattern
                      {s.patternCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(s)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {confirmDeleteId === s.id ? (
                        <Button size="sm" variant="destructive" onClick={() => remove(s.id)}>
                          Delete shift and its patterns
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmDeleteId(s.id)}
                          title="Delete"
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1 text-center">
                  {WEEKDAY_LABELS.map((label, i) => (
                    <div key={label} className="rounded bg-gray-50 py-1">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p
                        className={`text-xs font-medium ${
                          s.minCoverByWeekday[i] > 0 ? "text-gray-900" : "text-gray-300"
                        }`}
                      >
                        {s.minCoverByWeekday[i] > 0 ? s.minCoverByWeekday[i] : "–"}
                      </p>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canManage && editingId && (
          <form onSubmit={save} className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
            <p className="text-sm font-medium text-gray-900">
              {editingId === "new" ? "New shift" : "Edit shift"}
            </p>
            <Input
              id="shiftName"
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Night"
              required
              maxLength={60}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="shiftStart"
                label="Starts"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                required
              />
              <Input
                id="shiftEnd"
                label="Ends"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                required
              />
            </div>
            {overnight(form) && form.startTime !== form.endTime && (
              <p className="text-xs text-gray-500">
                Ends the next morning. It counts on the day it starts.
              </p>
            )}
            <fieldset>
              <div className="mb-1 flex items-center justify-between">
                <legend className="text-sm font-medium text-gray-700">
                  Minimum staff each day
                </legend>
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  onClick={() => setForm({ ...form, mins: Array(7).fill(form.mins[0]) })}
                >
                  Copy Monday to all
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((label, i) => (
                  <label key={label} className="text-center">
                    <span className="block text-[11px] text-gray-500">{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      inputMode="numeric"
                      value={form.mins[i]}
                      onChange={(e) => {
                        const mins = [...form.mins];
                        mins[i] = e.target.value;
                        setForm({ ...form, mins });
                      }}
                      className="mt-0.5 w-full rounded-md border border-gray-300 px-1 py-1.5 text-center text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      aria-label={`Minimum on ${label}`}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save shift"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {canManage && !editingId && (
          <Button size="sm" variant="outline" onClick={startAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add shift
          </Button>
        )}
      </div>
    </Dialog>
  );
}

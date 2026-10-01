"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { WEEKDAY_LABELS } from "@/lib/shiftCover";

type PatternResponse = {
  region: { id: string; name: string } | null;
  shifts: Array<{ id: string; name: string; startTime: string; endTime: string }>;
  entries: Array<{ shiftTypeId: string; weekday: number }>;
};

function key(shiftTypeId: string, weekday: number) {
  return `${shiftTypeId}:${weekday}`;
}

/**
 * Recurring working pattern for a member of a shift-based region. Renders
 * nothing when regions are off, the member has no region, or the region has
 * no shifts (cover then uses the region's single daily minimum).
 */
export function WorkPatternCard({
  memberId,
  canManage,
}: {
  memberId: string;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<PatternResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/team-members/${memberId}/work-pattern`);
    if (!res.ok) {
      setData(null);
      return;
    }
    const body: PatternResponse = await res.json();
    setData(body);
    setSelected(new Set(body.entries.map((e) => key(e.shiftTypeId, e.weekday))));
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const saved = useMemo(
    () => new Set(data?.entries.map((e) => key(e.shiftTypeId, e.weekday)) ?? []),
    [data]
  );
  const dirty =
    saved.size !== selected.size || [...selected].some((k) => !saved.has(k));

  if (!data?.region || data.shifts.length === 0) return null;

  function toggle(shiftTypeId: string, weekday: number) {
    const k = key(shiftTypeId, weekday);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const entries = [...selected].map((k) => {
        const [shiftTypeId, weekday] = k.split(":");
        return { shiftTypeId, weekday: Number(weekday) };
      });
      const res = await fetch(`/api/team-members/${memberId}/work-pattern`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (res.ok) {
        toast("Working pattern saved. It applies from today.", "success");
        await load();
      } else {
        const body = await res.json().catch(() => null);
        toast(body?.error ?? "Failed to save working pattern", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="working-pattern">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Working pattern
        </CardTitle>
        <CardDescription>
          The shifts this person normally works in {data.region.name}. Cover is
          counted from these patterns, so someone off on a day they don&apos;t
          work doesn&apos;t leave a gap.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="py-1 pr-3 text-left font-medium">Shift</th>
                {WEEKDAY_LABELS.map((d) => (
                  <th key={d} className="px-1 py-1 text-center font-medium">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.shifts.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500">
                      {s.startTime}–{s.endTime}
                    </p>
                  </td>
                  {WEEKDAY_LABELS.map((d, weekday) => (
                    <td key={d} className="px-1 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(key(s.id, weekday))}
                        disabled={!canManage}
                        onChange={() => toggle(s.id, weekday)}
                        aria-label={`${s.name} on ${d}`}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-60"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected.size === 0 && (
          <p className="text-xs text-amber-700">
            No shifts selected. This person&apos;s leave won&apos;t count against
            cover until they have a pattern.
          </p>
        )}

        {canManage ? (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save pattern"}
            </Button>
            <Link
              href="/settings/regions"
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Edit shifts
            </Link>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Ask a manager to change your pattern.</p>
        )}
      </CardContent>
    </Card>
  );
}

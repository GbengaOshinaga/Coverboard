"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ChildWithUsage } from "@/lib/children-server";

/**
 * Children, for unpaid parental leave (18 weeks per child before their 18th
 * birthday, at most 4 a year). Only a date of birth is needed; a first name
 * just helps tell them apart.
 */

export function childName(c: Pick<ChildWithUsage, "label" | "dateOfBirth">): string {
  const born = new Date(`${c.dateOfBirth}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return c.label ? `${c.label} (born ${born})` : `Child born ${born}`;
}

export function useChildren(memberId: string | undefined) {
  const [children, setChildren] = useState<ChildWithUsage[] | null>(null);
  const reload = useCallback(async () => {
    if (!memberId) return;
    const res = await fetch(`/api/team-members/${memberId}/children`);
    setChildren(res.ok ? await res.json() : []);
  }, [memberId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { children, reload };
}

export function AddChildForm({
  memberId,
  onAdded,
  onCancel,
}: {
  memberId: string;
  onAdded: (id: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [weeksElsewhere, setWeeksElsewhere] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Not a <form>: this sits inside the leave request form.
  async function save() {
    setError("");
    if (!dateOfBirth) {
      setError("Add their date of birth.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/team-members/${memberId}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim() || null,
        dateOfBirth,
        weeksTakenElsewhere: Number(weeksElsewhere) || 0,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't add the child");
      return;
    }
    onAdded(data.id);
  }

  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          id="childDateOfBirth"
          label="Date of birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
        <Input
          id="childLabel"
          label="First name (optional)"
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          id="childWeeksElsewhere"
          label="Weeks taken in other jobs"
          type="number"
          min="0"
          max="18"
          value={weeksElsewhere}
          onChange={(e) => setWeeksElsewhere(e.target.value)}
        />
      </div>
      <p className="text-xs text-gray-500">
        The 18 weeks are per child, not per job, so include unpaid parental leave already taken for
        this child with previous employers.
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? "Adding…" : "Add child"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function daysLeft(c: ChildWithUsage) {
  const thisYear = Math.max(0, c.usage.capThisYear - c.usage.daysThisYear);
  const total = Math.max(0, c.usage.capTotal - c.usage.daysTotal);
  return Math.min(thisYear, total);
}

export function usageLine(c: ChildWithUsage): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  // The child's year runs from their birthday (or a year's service), not January.
  return `${c.usage.daysThisYear} of ${c.usage.capThisYear} days this year (${f(c.year.start)} – ${f(c.year.end)}) · ${c.usage.daysTotal} of ${c.usage.capTotal} in total · ${daysLeft(c)} days left now`;
}

/** Profile card: a member's children and their unpaid parental leave so far. */
export function ChildrenCard({ memberId }: { memberId: string }) {
  const { children, reload } = useChildren(memberId);
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  async function remove(c: ChildWithUsage) {
    const res = await fetch(`/api/team-members/${memberId}/children/${c.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      toast("Child removed", "success");
      void reload();
    } else {
      toast(data?.error ?? "Couldn't remove the child", "error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Children</CardTitle>
        <CardDescription>
          For unpaid parental leave: up to 18 weeks for each child before their 18th birthday, at
          most 4 weeks a year for each child. A week is the days they normally work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {children === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : children.length === 0 && !adding ? (
          <p className="text-sm text-gray-500">No children added.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {children.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{childName(c)}</p>
                  <p className="text-xs text-gray-500">{usageLine(c)}</p>
                  <p className="text-xs text-gray-400">
                    Can be taken until {new Date(`${c.eighteenthBirthday}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" })}
                    {c.weeksTakenElsewhere > 0 ? ` · includes ${c.weeksTakenElsewhere} weeks taken in other jobs` : ""}
                  </p>
                </div>
                {!c.hasLeave && (
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="text-xs text-gray-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <AddChildForm
            memberId={memberId}
            onAdded={() => {
              setAdding(false);
              toast("Child added", "success");
              void reload();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            Add a child
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

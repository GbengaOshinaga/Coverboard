"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ChildWithUsage } from "@/lib/children-server";
import { DISABILITY_BENEFITS } from "@/lib/unpaid-parental";

/**
 * Children, for unpaid parental leave (18 weeks per child before their 18th
 * birthday, at most 4 a year). Only a date of birth is needed; a first name
 * just helps tell them apart. An adopted child's placement date and a
 * disability benefit change when and how the leave can be taken.
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

/** Adds a child, or edits one when `child` is given. */
export function AddChildForm({
  memberId,
  child,
  onAdded,
  onCancel,
}: {
  memberId: string;
  child?: ChildWithUsage;
  onAdded: (id: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(child?.label ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(child?.dateOfBirth ?? "");
  const [weeksElsewhere, setWeeksElsewhere] = useState(String(child?.weeksTakenElsewhere ?? 0));
  const [adopted, setAdopted] = useState(!!child?.placedOn);
  const [placedOn, setPlacedOn] = useState(child?.placedOn ?? "");
  const [disabilityBenefit, setDisabilityBenefit] = useState(child?.disabilityBenefit ?? false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Not a <form>: this sits inside the leave request form.
  async function save() {
    setError("");
    if (!dateOfBirth) {
      setError("Add their date of birth.");
      return;
    }
    if (adopted && !placedOn) {
      setError("Add the date they were placed with you.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/team-members/${memberId}/children${child ? `/${child.id}` : ""}`, {
      method: child ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim() || null,
        dateOfBirth,
        weeksTakenElsewhere: Number(weeksElsewhere) || 0,
        placedOn: adopted ? placedOn : null,
        disabilityBenefit,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? (child ? "Couldn't save the child" : "Couldn't add the child"));
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
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          checked={adopted}
          onChange={(e) => setAdopted(e.target.checked)}
        />
        <span>Adopted</span>
      </label>
      {adopted && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            id="childPlacedOn"
            label="Placed with them on"
            type="date"
            value={placedOn}
            onChange={(e) => setPlacedOn(e.target.value)}
          />
        </div>
      )}
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          checked={disabilityBenefit}
          onChange={(e) => setDisabilityBenefit(e.target.checked)}
        />
        <span>
          Gets {DISABILITY_BENEFITS}
          <span className="block text-xs text-gray-500">
            Leave for this child can then be taken a day at a time. Otherwise it&apos;s whole weeks only.
          </span>
        </span>
      </label>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? (child ? "Saving…" : "Adding…") : child ? "Save" : "Add child"}
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
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  // The child's year runs from when the parent became entitled, not January.
  // Leave booked in a later year is listed with that year, not lost.
  const later = (c.laterYears ?? []).map((y) => ` · ${y.days} of ${c.usage.capThisYear} booked for ${f(y.start)} – ${f(y.end)}`).join("");
  return `${c.usage.daysThisYear} of ${c.usage.capThisYear} days this year (${f(c.year.start)} – ${f(c.year.end)})${later} · ${c.usage.daysTotal} of ${c.usage.capTotal} in total · ${daysLeft(c)} days left now · ${c.disabilityBenefit ? "can be taken in days" : "whole weeks only"}`;
}

/** Profile card: a member's children and their unpaid parental leave so far. */
export function ChildrenCard({ memberId }: { memberId: string }) {
  const { children, reload } = useChildren(memberId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
          most 4 weeks a year for each child, in whole weeks unless the child gets a disability
          benefit. A week is the days they normally work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {children === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : children.length === 0 && !adding ? (
          <p className="text-sm text-gray-500">No children added.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {children.map((c) =>
              editingId === c.id ? (
                <li key={c.id} className="py-2">
                  <AddChildForm
                    memberId={memberId}
                    child={c}
                    onAdded={() => {
                      setEditingId(null);
                      toast("Child updated", "success");
                      void reload();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{childName(c)}</p>
                  <p className="text-xs text-gray-500">{usageLine(c)}</p>
                  <p className="text-xs text-gray-400">
                    Can be taken until {new Date(`${c.eighteenthBirthday}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" })}
                    {c.weeksTakenElsewhere > 0 ? ` · includes ${c.weeksTakenElsewhere} weeks taken in other jobs` : ""}
                    {c.placedOn ? ` · placed ${new Date(`${c.placedOn}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" })}` : ""}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(c.id)}
                    className="text-xs text-gray-500 hover:text-gray-900"
                  >
                    Edit
                  </button>
                  {!c.hasLeave && (
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      className="text-xs text-gray-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
              )
            )}
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  RIGHT_TO_WORK_METHOD_LABEL,
  rightToWorkLabel,
  rightToWorkStatus,
  type RightToWorkMethod,
} from "@/lib/right-to-work";

type Check = {
  id: string;
  checkedOn: string;
  method: RightToWorkMethod;
  documentType: string | null;
  hasRightToWork: boolean;
  expiresOn: string | null;
  notes: string | null;
  checkedBy: string | null;
};

const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: string) => utc(d).toLocaleDateString("en-GB", { timeZone: "UTC" });

/**
 * Right-to-work checks on a UK employee's profile: their status, a form to
 * record a check (the date is what the Home Office requires), and history.
 */
export function RightToWorkCard({ memberId }: { memberId: string }) {
  const { toast } = useToast();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    checkedOn: new Date().toISOString().slice(0, 10),
    method: "ONLINE_SHARE_CODE" as RightToWorkMethod,
    documentType: "",
    outcome: "unlimited" as "unlimited" | "time_limited" | "none",
    expiresOn: "",
    notes: "",
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/team-members/${memberId}/right-to-work`);
    if (res.ok) setChecks(await res.json());
    else {
      const data = await res.json().catch(() => null);
      setLocked(data?.error ?? "Right-to-work checks aren't available.");
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setError("");
    if (form.outcome === "time_limited" && !form.expiresOn) {
      setError("Add the date their permission ends.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/team-members/${memberId}/right-to-work`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkedOn: form.checkedOn,
        method: form.method,
        documentType: form.documentType.trim() || null,
        hasRightToWork: form.outcome !== "none",
        expiresOn: form.outcome === "time_limited" ? form.expiresOn : null,
        notes: form.notes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save the check");
      return;
    }
    toast("Right-to-work check recorded", "success");
    setAdding(false);
    void load();
  }

  const latest = checks?.[0];
  const status = latest
    ? rightToWorkStatus({
        verified: latest.hasRightToWork,
        expiresOn: latest.expiresOn ? utc(latest.expiresOn) : null,
      })
    : "not_checked";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Right to work</CardTitle>
        <CardDescription>
          Record each check with its date, as the Home Office requires. Keep
          copies of the documents yourself, during their employment and for 2
          years after. Time-limited permission has to be checked again before it
          ends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {locked ? (
          <p className="text-sm text-gray-500">{locked}</p>
        ) : checks === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <Badge
              variant={
                status === "checked"
                  ? "success"
                  : status === "recheck_due"
                    ? "warning"
                    : status === "not_checked"
                      ? "outline"
                      : "error"
              }
            >
              {rightToWorkLabel(status, {
                expiresOn: latest?.expiresOn ? utc(latest.expiresOn) : null,
                checkedOn: latest ? utc(latest.checkedOn) : null,
              })}
            </Badge>

            {checks.length > 0 && (
              <ul className="divide-y divide-gray-100 text-sm">
                {checks.map((c) => (
                  <li key={c.id} className="py-2">
                    <p className="font-medium text-gray-900">
                      {fmt(c.checkedOn)} · {RIGHT_TO_WORK_METHOD_LABEL[c.method]}
                      {c.documentType ? ` · ${c.documentType}` : ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {!c.hasRightToWork
                        ? "No right to work found"
                        : c.expiresOn
                          ? `Permission until ${fmt(c.expiresOn)}`
                          : "No time limit"}
                      {c.checkedBy ? ` · checked by ${c.checkedBy}` : ""}
                      {c.notes ? ` · ${c.notes}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {adding ? (
              <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                {error && <p className="text-sm text-red-700">{error}</p>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    id="rtwCheckedOn"
                    label="Date of check"
                    type="date"
                    value={form.checkedOn}
                    onChange={(e) => setForm({ ...form, checkedOn: e.target.value })}
                  />
                  <Select
                    id="rtwMethod"
                    label="How"
                    options={Object.entries(RIGHT_TO_WORK_METHOD_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value as RightToWorkMethod })}
                  />
                  <Input
                    id="rtwDocument"
                    label="Document (optional)"
                    placeholder="e.g. UK passport, share code result"
                    value={form.documentType}
                    onChange={(e) => setForm({ ...form, documentType: e.target.value })}
                  />
                  <Select
                    id="rtwOutcome"
                    label="Result"
                    options={[
                      { value: "unlimited", label: "Right to work, no time limit" },
                      { value: "time_limited", label: "Right to work until a date" },
                      { value: "none", label: "No right to work" },
                    ]}
                    value={form.outcome}
                    onChange={(e) =>
                      setForm({ ...form, outcome: e.target.value as typeof form.outcome })
                    }
                  />
                  {form.outcome === "time_limited" && (
                    <Input
                      id="rtwExpiresOn"
                      label="Permission ends"
                      type="date"
                      value={form.expiresOn}
                      onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
                    />
                  )}
                  <Input
                    id="rtwNotes"
                    label="Notes (optional)"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save check"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
                Record a check
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { optOutInForce } from "@/lib/working-time";

const day = (d: string | null | undefined) => (d ? d.slice(0, 10) : "");
const fmt = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" });

/**
 * The 48-hour week opt-out (WTR reg. 5): voluntary and in writing, for a set
 * time or open-ended, cancellable by the worker with at least 7 days' notice.
 * The signed copy stays with the employer; this records that it exists.
 */
export function WorkingTimeOptOutCard({
  memberId,
  optOutFrom,
  optOutUntil,
  onSaved,
}: {
  memberId: string;
  optOutFrom: string | null | undefined;
  optOutUntil: string | null | undefined;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(day(optOutFrom));
  const [until, setUntil] = useState(day(optOutUntil));
  const [saving, setSaving] = useState(false);
  const inForce = optOutInForce({
    optOutFrom: optOutFrom ? new Date(optOutFrom) : null,
    optOutUntil: optOutUntil ? new Date(optOutUntil) : null,
  });

  async function save(clear = false) {
    setSaving(true);
    const res = await fetch(`/api/team-members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workingTimeOptOutFrom: clear ? null : from || null,
        workingTimeOptOutUntil: clear ? null : until || null,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      toast(data?.error ?? "Couldn't save the opt-out", "error");
      return;
    }
    toast(clear ? "Opt-out removed" : "Opt-out saved", "success");
    setEditing(false);
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>48-hour week opt-out</CardTitle>
        <CardDescription>
          Staff can choose to work more than 48 hours a week on average by
          opting out in writing. It must be voluntary, and they can cancel it
          with at least 7 days&apos; notice. Keep the signed copy; record it
          here so the working time report knows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-700">
          {optOutFrom
            ? `${inForce ? "Opted out" : "Opt-out not in force"}: signed ${fmt(optOutFrom)}${
                optOutUntil ? `, until ${fmt(optOutUntil)}` : ", no end date"
              }.`
            : "No opt-out recorded: the 48-hour average applies."}
        </p>
        {editing ? (
          <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input id="optOutFrom" label="Signed on" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input
                id="optOutUntil"
                label="Until (optional)"
                type="date"
                value={until}
                min={from}
                onChange={(e) => setUntil(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => save()} disabled={saving || !from}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              {optOutFrom ? "Change" : "Record an opt-out"}
            </Button>
            {optOutFrom && (
              <Button type="button" size="sm" variant="outline" onClick={() => save(true)} disabled={saving}>
                They&apos;ve cancelled it
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

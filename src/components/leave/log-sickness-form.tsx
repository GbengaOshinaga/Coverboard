"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RegionalCoverWarning } from "./regional-cover-warning";

type Member = { id: string; name: string; regionName: string | null };
type SicknessType = { id: string; name: string };

type Logged = {
  requestId: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
};

function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return FMT.format(new Date(y, m - 1, d));
}

/**
 * Fast path for the pre-shift sick call: pick who, confirm dates, save, then
 * see straight away where cover is now short and who could step in.
 */
export function LogSicknessForm({
  members,
  sicknessTypes,
}: {
  members: Member[];
  sicknessTypes: SicknessType[];
}) {
  const defaultType =
    sicknessTypes.find((t) => t.name.includes("SSP")) ?? sicknessTypes[0];
  const [userId, setUserId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState(defaultType?.id ?? "");
  const [startDate, setStartDate] = useState(todayLocal);
  const [endDate, setEndDate] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logged, setLogged] = useState<Logged | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          leaveTypeId,
          note: note.trim() || undefined,
          onBehalfOfUserId: userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't log this absence");
        return;
      }
      setLogged({
        requestId: data.id,
        userId,
        name: members.find((m) => m.id === userId)?.name ?? "They",
        startDate,
        endDate,
      });
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setLogged(null);
    setUserId("");
    setNote("");
    setStartDate(todayLocal());
    setEndDate(todayLocal());
  }

  if (logged) {
    const sameDay = logged.startDate === logged.endDate;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{logged.name}</strong> logged as off sick{" "}
            {sameDay
              ? `on ${formatDay(logged.startDate)}`
              : `${formatDay(logged.startDate)} – ${formatDay(logged.endDate)}`}
            . No fit note is needed for the first 7 days.
          </span>
        </div>

        <RegionalCoverWarning
          startDate={logged.startDate}
          endDate={logged.endDate}
          userId={logged.userId}
          excludeRequestId={logged.requestId}
          variant="logged"
        />

        <div className="flex items-center gap-3">
          <Button type="button" onClick={reset}>
            Log another
          </Button>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (sicknessTypes.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        There&apos;s no sickness leave type set up yet. Add one in{" "}
        <Link href="/settings" className="font-medium text-brand-600 hover:underline">
          Settings
        </Link>{" "}
        first.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Select
        id="member"
        label="Who's off sick?"
        options={members.map((m) => ({
          value: m.id,
          label: m.regionName ? `${m.name} · ${m.regionName}` : m.name,
        }))}
        placeholder="Select team member"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        required
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="startDate"
          label="First day off"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            if (endDate < e.target.value) setEndDate(e.target.value);
          }}
          required
        />
        <Input
          id="endDate"
          label="Expected last day off"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate}
          required
        />
      </div>

      {sicknessTypes.length > 1 && (
        <Select
          id="leaveType"
          label="Absence type"
          options={sicknessTypes.map((t) => ({ value: t.id, label: t.name }))}
          value={leaveTypeId}
          onChange={(e) => setLeaveTypeId(e.target.value)}
          required
        />
      )}

      <div className="space-y-1">
        <label htmlFor="note" className="block text-sm font-medium text-gray-700">
          Note (optional)
        </label>
        <textarea
          id="note"
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="e.g. Called in at 7:10"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="text-xs text-gray-500">
          No diagnosis needed. Keep medical details out of the note.
        </p>
      </div>

      <Button type="submit" disabled={loading || !userId}>
        {loading ? "Saving..." : "Log sickness"}
      </Button>
    </form>
  );
}

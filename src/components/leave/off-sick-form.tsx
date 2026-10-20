"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return FMT.format(new Date(y, m - 1, d));
}

/**
 * Staff telling the team they're off sick: two dates and save. Sickness is
 * recorded straight away (nothing to approve) and their managers are emailed
 * to arrange cover (src/lib/leave-requests/create.ts).
 */
export function OffSickForm({
  sicknessTypeId,
  /** UK workers: a fit note is needed after 7 days. */
  showFitNoteHint,
}: {
  sicknessTypeId: string | null;
  showFitNoteHint: boolean;
}) {
  const [startDate, setStartDate] = useState(todayLocal);
  const [endDate, setEndDate] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!sicknessTypeId) {
    return (
      <p className="text-sm text-gray-600">
        Your team hasn&apos;t set up sickness in Coverboard yet, so please tell your manager directly.
      </p>
    );
  }

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
          leaveTypeId: sicknessTypeId,
          sicknessNote: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't record this. Please tell your manager directly.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Something went wrong. Please tell your manager directly.");
    } finally {
      setLoading(false);
    }
  }

  if (saved) {
    const sameDay = startDate === endDate;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Recorded: you&apos;re off sick{" "}
            {sameDay ? `on ${formatDay(startDate)}` : `${formatDay(startDate)} – ${formatDay(endDate)}`}. Your
            managers have been told, so there&apos;s nothing else to do. Get well soon.
          </span>
        </div>
        <p className="text-sm text-gray-600">
          Still unwell after that? Tell your manager, who can extend it.
          {showFitNoteHint && " If you're off for more than 7 days, you'll need a fit note from your GP."} You can see
          it in{" "}
          <Link href="/my-time-off" className="font-medium text-brand-600 hover:underline">
            My time off
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

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
          label="When do you expect to be back? (last day off)"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate}
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="note" className="block text-sm font-medium text-gray-700">
          Anything your manager should know? (optional)
        </label>
        <textarea
          id="note"
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="e.g. I'll update you tomorrow morning"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="text-xs text-gray-500">
          You don&apos;t need to say what&apos;s wrong. Only you and admins see this note.
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "I'm off sick"}
      </Button>
    </form>
  );
}

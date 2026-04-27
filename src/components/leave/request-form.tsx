"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { OverlapWarning } from "./overlap-warning";
import { BalanceIndicator } from "./balance-indicator";
import { CoverageWarning } from "./coverage-warning";
import { RegionalCoverWarning } from "./regional-cover-warning";
import { countWeekdays } from "@/lib/utils";

type LeaveType = {
  id: string;
  name: string;
  color: string;
};

type OverlapData = {
  overlapping: {
    id: string;
    user: { id: string; name: string; memberType: string };
    leaveType: { name: string; color: string };
    startDate: string;
    endDate: string;
    status: string;
  }[];
  teamCount: number;
  uniqueUsersOut: number;
  coverageRatio: number;
  isHighOverlap: boolean;
};

type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
};

export function RequestForm({ leaveTypes, currentUserId }: { leaveTypes: LeaveType[]; currentUserId?: string }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [overlapData, setOverlapData] = useState<OverlapData | null>(null);
  const [overlapLoading, setOverlapLoading] = useState(false);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // Fetch the user's leave balances on mount
  useEffect(() => {
    async function fetchBalances() {
      setBalanceLoading(true);
      try {
        const res = await fetch("/api/leave-balances");
        if (res.ok) {
          setBalances(await res.json());
        }
      } catch {
        // Silently fail
      }
      setBalanceLoading(false);
    }
    fetchBalances();
  }, []);

  const selectedBalance = useMemo(
    () => balances.find((b) => b.leaveTypeId === leaveTypeId) ?? null,
    [balances, leaveTypeId]
  );

  const requestedDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return countWeekdays(new Date(startDate), new Date(endDate));
  }, [startDate, endDate]);

  const checkOverlap = useCallback(async () => {
    if (!startDate || !endDate) return;

    setOverlapLoading(true);
    try {
      const params = new URLSearchParams({
        from: new Date(startDate).toISOString(),
        to: new Date(endDate).toISOString(),
      });
      const res = await fetch(`/api/overlap?${params}`);
      if (res.ok) {
        setOverlapData(await res.json());
      }
    } catch {
      // Silently fail overlap check
    }
    setOverlapLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(checkOverlap, 300);
    return () => clearTimeout(timer);
  }, [checkOverlap]);

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
          note: note || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit request");
        setLoading(false);
        return;
      }

      router.push("/requests");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  const leaveTypeOptions = leaveTypes.map((lt) => {
    const bal = balances.find((b) => b.leaveTypeId === lt.id);
    return {
      value: lt.id,
      label: bal ? `${lt.name} (${bal.remaining} days left)` : lt.name,
    };
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="startDate"
          label="Start date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
        <Input
          id="endDate"
          label="End date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate}
          required
        />
      </div>

      {startDate && endDate && requestedDays > 0 && (
        <p className="text-xs text-gray-500">
          {requestedDays} weekday{requestedDays !== 1 ? "s" : ""} selected
        </p>
      )}

      <Select
        id="leaveType"
        label="Leave type"
        options={leaveTypeOptions}
        placeholder="Select leave type"
        value={leaveTypeId}
        onChange={(e) => setLeaveTypeId(e.target.value)}
        required
      />

      {/* Balance indicator */}
      {leaveTypeId && (
        <BalanceIndicator
          balance={selectedBalance}
          requestedDays={requestedDays}
          loading={balanceLoading}
        />
      )}

      <div className="space-y-1">
        <label
          htmlFor="note"
          className="block text-sm font-medium text-gray-700"
        >
          Note (optional)
        </label>
        <textarea
          id="note"
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="Reason for leave..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Overlap detection */}
      {startDate && endDate && (
        <OverlapWarning data={overlapData} loading={overlapLoading} />
      )}

      {/* Jira coverage warning (informational) */}
      {startDate && endDate && currentUserId && (
        <CoverageWarning
          userId={currentUserId}
          startDate={new Date(startDate).toISOString()}
          endDate={new Date(endDate).toISOString()}
        />
      )}

      {/* Regional minimum-cover warning */}
      {startDate && endDate && (
        <RegionalCoverWarning
          startDate={startDate}
          endDate={endDate}
          userId={currentUserId}
        />
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit request"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RequestCard } from "@/components/leave/request-card";
import {
  ApproveCoverModal,
  type CoverConflict,
} from "@/components/leave/approve-cover-modal";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Plus } from "lucide-react";

type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
};

type LeaveRequest = {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  note: string | null;
  createdAt: string;
  coverOverride?: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    memberType: string;
    regionId?: string | null;
  };
  leaveType: {
    id: string;
    name: string;
    color: string;
  };
  reviewedBy: { name: string } | null;
};

export default function RequestsPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [userBalances, setUserBalances] = useState<Record<string, LeaveBalance[]>>({});
  const [regionsEnabled, setRegionsEnabled] = useState(false);
  const [soleApprover, setSoleApprover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/organization/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setRegionsEnabled(Boolean(data.regionsEnabled));
          setSoleApprover(Boolean(data.soleApprover));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const user = session?.user as Record<string, unknown> | undefined;
  const userId = user?.id as string | undefined;
  const userRole = user?.role as string | undefined;
  const isReviewer = userRole === "ADMIN" || userRole === "MANAGER";
  const { toast } = useToast();

  // `silent` refreshes in place, so cards keep their local state (e.g. the
  // cover check shown after changing an end date).
  const fetchRequests = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "ALL") {
      params.set("status", filter);
    }

    const res = await fetch(`/api/leave-requests?${params}`);
    if (res.ok) {
      setRequests(await res.json());
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Fetch balances for users with pending requests (for reviewers)
  useEffect(() => {
    if (!isReviewer) return;
    const pendingRequests = requests.filter(
      (r) => r.status === "PENDING" && r.user.id !== userId
    );
    const uniqueUserIds = [...new Set(pendingRequests.map((r) => r.user.id))];
    const missingUserIds = uniqueUserIds.filter((id) => !userBalances[id]);

    if (missingUserIds.length === 0) return;

    Promise.all(
      missingUserIds.map(async (uid) => {
        const res = await fetch(`/api/leave-balances?userId=${uid}`);
        if (res.ok) {
          const balances: LeaveBalance[] = await res.json();
          return { userId: uid, balances };
        }
        return null;
      })
    ).then((results) => {
      const newBalances: Record<string, LeaveBalance[]> = {};
      for (const r of results) {
        if (r) newBalances[r.userId] = r.balances;
      }
      if (Object.keys(newBalances).length > 0) {
        setUserBalances((prev) => ({ ...prev, ...newBalances }));
      }
    });
  }, [requests, isReviewer, userId, userBalances]);

  const [cancelTarget, setCancelTarget] = useState<(typeof requests)[number] | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{
    id: string;
    requesterName: string;
    regionName: string | null;
    conflicts: CoverConflict[];
  } | null>(null);
  const [overrideBusy, setOverrideBusy] = useState(false);

  async function patchStatus(
    id: string,
    body: Record<string, unknown>,
    successLabel: string,
    successKind: "success" | "error" | "info"
  ) {
    const res = await fetch(`/api/leave-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      toast(`Request ${successLabel}`, successKind);
      fetchRequests();
      return true;
    }
    const data = await res.json().catch(() => null);
    toast(data?.error ?? "Failed to update request", "error");
    return false;
  }

  async function handleAction(id: string, status: string) {
    // Cancelling asks first (and says who'll be emailed).
    if (status === "CANCELLED") {
      const target = requests.find((r) => r.id === id);
      if (target) setCancelTarget(target);
      return;
    }
    if (status !== "APPROVED") {
      const label =
        status === "REJECTED" ? "rejected" : "cancelled";
      const kind = status === "REJECTED" ? "error" : "info";
      await patchStatus(id, { status }, label, kind);
      return;
    }

    const target = requests.find((r) => r.id === id);
    if (!target) return;

    try {
      const res = await fetch(`/api/leave-requests/${id}/check-cover`, {
        method: "POST",
      });
      if (res.ok) {
        const result = (await res.json()) as {
          hasConflict: boolean;
          conflicts: CoverConflict[];
          regionName: string | null;
        };
        if (result.hasConflict) {
          setOverrideTarget({
            id,
            requesterName: target.user.name,
            regionName: result.regionName,
            conflicts: result.conflicts,
          });
          return;
        }
      }
    } catch {
      // fall through and try to approve anyway
    }

    await patchStatus(id, { status: "APPROVED" }, "approved", "success");
  }

  async function confirmOverride() {
    if (!overrideTarget) return;
    setOverrideBusy(true);
    const ok = await patchStatus(
      overrideTarget.id,
      { status: "APPROVED", coverOverride: true },
      "approved (cover overridden)",
      "success"
    );
    setOverrideBusy(false);
    if (ok) setOverrideTarget(null);
  }

  const filters = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Leave Requests</h1>
          <p className="text-xs text-gray-500 sm:text-sm">
            {isReviewer
              ? "Review and manage all team leave requests"
              : "View and manage your leave requests"}
          </p>
        </div>
        <Link href="/requests/new" className="self-start sm:self-auto">
          <Button size="sm" className="sm:size-default">
            <Plus className="mr-1.5 h-4 w-4" />
            New request
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Requests list */}
      {loading ? (
        <TableSkeleton rows={4} />
      ) : requests.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">No leave requests found.</p>
          <Link href="/requests/new">
            <Button variant="outline" className="mt-3">
              Submit your first request
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const balancesForUser = userBalances[request.user.id];
            const balanceForType = balancesForUser?.find(
              (b) => b.leaveTypeId === request.leaveType.id
            );

            return (
              <RequestCard
                key={request.id}
                request={request}
                canReview={
                  isReviewer &&
                  (request.user.id !== userId || soleApprover)
                }
                // Their own leave, or (admins and managers) approved leave
                // for someone else; pending requests are rejected instead.
                canCancel={request.user.id === userId || (isReviewer && request.status === "APPROVED")}
                regionsEnabled={regionsEnabled}
                onAction={handleAction}
                onUpdated={() => fetchRequests({ silent: true })}
                balance={balanceForType}
              />
            );
          })}
        </div>
      )}

      <Dialog
        open={!!cancelTarget}
        onClose={() => {
          if (!cancelBusy) setCancelTarget(null);
        }}
        title={
          cancelTarget && cancelTarget.user.id !== userId
            ? `Cancel ${cancelTarget.user.name}'s leave?`
            : "Cancel your leave?"
        }
      >
        {cancelTarget && (
          <>
            <p className="text-sm text-gray-700">
              {cancelTarget.leaveType.name},{" "}
              {new Date(cancelTarget.startDate).toLocaleDateString("en-GB", { timeZone: "UTC" })} –{" "}
              {new Date(cancelTarget.endDate).toLocaleDateString("en-GB", { timeZone: "UTC" })}.
            </p>
            <p className="mt-2 text-sm text-gray-700">
              {cancelTarget.user.id !== userId
                ? `${cancelTarget.user.name} will be emailed that you cancelled it.`
                : "Your approvers will be told if it was already approved."}{" "}
              This can&apos;t be undone; it would need booking again.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={cancelBusy} onClick={() => setCancelTarget(null)}>
                Keep it
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={cancelBusy}
                onClick={async () => {
                  setCancelBusy(true);
                  await patchStatus(cancelTarget.id, { status: "CANCELLED" }, "cancelled", "info");
                  setCancelBusy(false);
                  setCancelTarget(null);
                }}
              >
                {cancelBusy ? "Cancelling…" : "Cancel leave"}
              </Button>
            </div>
          </>
        )}
      </Dialog>

      <ApproveCoverModal
        open={!!overrideTarget}
        onClose={() => setOverrideTarget(null)}
        onConfirm={confirmOverride}
        conflicts={overrideTarget?.conflicts ?? []}
        regionName={overrideTarget?.regionName ?? null}
        requesterName={overrideTarget?.requesterName ?? ""}
        loading={overrideBusy}
      />
    </div>
  );
}

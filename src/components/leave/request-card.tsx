"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverageWarning } from "./coverage-warning";
import { RegionalCoverPanel } from "./regional-cover-panel";
import { RegionalCoverWarning } from "./regional-cover-warning";
import { formatDateRange, countWeekdays } from "@/lib/utils";
import { Check, X, ChevronDown, ChevronRight, CalendarClock } from "lucide-react";
import { isSicknessLeaveTypeName } from "@/lib/leave-requests/rules";

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
  hoursBooked?: number | null;
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

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "error",
  CANCELLED: "default",
};

export function RequestCard({
  request,
  canReview,
  canCancel,
  regionsEnabled = false,
  onAction,
  onUpdated,
  balance,
}: {
  request: LeaveRequest;
  canReview: boolean;
  canCancel: boolean;
  regionsEnabled?: boolean;
  onAction?: (id: string, status: string) => void;
  /** Called after the request's dates change, so the list can refetch. */
  onUpdated?: () => void;
  balance?: LeaveBalance | null;
}) {
  const days = countWeekdays(
    new Date(request.startDate),
    new Date(request.endDate)
  );

  const [showCover, setShowCover] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);
  const [endDraft, setEndDraft] = useState(request.endDate.slice(0, 10));
  const [endError, setEndError] = useState("");
  const [savingEnd, setSavingEnd] = useState(false);
  const [changedRange, setChangedRange] = useState<{ start: string; end: string } | null>(null);

  const canChangeEnd =
    canReview &&
    isSicknessLeaveTypeName(request.leaveType.name) &&
    (request.status === "APPROVED" || request.status === "PENDING");

  async function saveEndDate() {
    setEndError("");
    setSavingEnd(true);
    try {
      const res = await fetch(`/api/leave-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: endDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEndError(data.error || "Couldn't change the end date");
        return;
      }
      setEditingEnd(false);
      setChangedRange({ start: request.startDate.slice(0, 10), end: endDraft });
      onUpdated?.();
    } catch {
      setEndError("Something went wrong");
    } finally {
      setSavingEnd(false);
    }
  }

  const isUpcoming = new Date(request.startDate) > new Date();
  const showReview = canReview && request.status === "PENDING";
  // Pending leave can always be withdrawn; approved leave only while upcoming
  // (you can't un-take leave that's already started).
  const showCancel =
    canCancel &&
    (request.status === "PENDING" ||
      (request.status === "APPROVED" && isUpcoming));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
      <div className="flex items-start gap-3 sm:gap-4">
        <Avatar name={request.user.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap sm:gap-2">
            <p className="text-sm font-medium text-gray-900">
              {request.user.name}
            </p>
            {request.user.memberType !== "EMPLOYEE" && (
              <Badge variant="outline" className="text-[10px]">
                {request.user.memberType}
              </Badge>
            )}
            <Badge variant={statusVariant[request.status] ?? "default"}>
              {request.status}
            </Badge>
          </div>

          <div className="mt-1 flex items-center gap-1.5 flex-wrap sm:gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: request.leaveType.color }}
            />
            <span className="text-xs text-gray-600">
              {request.leaveType.name}
            </span>
            <span className="text-xs text-gray-400">&middot;</span>
            <span className="text-xs text-gray-600">
              {formatDateRange(
                new Date(request.startDate),
                new Date(request.endDate)
              )}
            </span>
            <span className="text-xs text-gray-400">&middot;</span>
            <span className="text-xs text-gray-600">
              {request.hoursBooked != null
                ? `${request.hoursBooked.toFixed(1)} hours`
                : `${days} day${days !== 1 ? "s" : ""}`}
            </span>
          </div>

        {request.note && (
          <p className="mt-1.5 text-xs text-gray-500">{request.note}</p>
        )}

        {request.reviewedBy && (
          <p className="mt-1 text-[10px] text-gray-400">
            Reviewed by {request.reviewedBy.name}
          </p>
        )}

          {balance && balance.allowance > 0 && canReview && request.status === "PENDING" && (
            <div className="mt-2 flex flex-wrap items-center gap-1 rounded bg-gray-50 px-2 py-1 sm:gap-2">
              <span className="text-[11px] text-gray-500">
                Balance: {balance.used} used / {balance.allowance} allowed
              </span>
              <span className="text-[11px] font-medium text-gray-600">
                &middot; {balance.remaining} remaining
              </span>
              {days > balance.remaining && (
                <span className="text-[11px] font-medium text-red-600">
                  (exceeds by {days - balance.remaining})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions — inline on desktop */}
        {(showReview || showCancel) && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {showReview && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => onAction?.(request.id, "APPROVED")}
                  title="Approve"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onAction?.(request.id, "REJECTED")}
                  title="Reject"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {showCancel && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction?.(request.id, "CANCELLED")}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Actions — stacked below on mobile */}
      {(showReview || showCancel) && (
        <div className="mt-2 flex items-center gap-1.5 sm:hidden">
          {showReview && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => onAction?.(request.id, "APPROVED")}
                className="flex-1"
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onAction?.(request.id, "REJECTED")}
                className="flex-1"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          )}
          {showCancel && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction?.(request.id, "CANCELLED")}
              className="flex-1"
            >
              Cancel
            </Button>
          )}
        </div>
      )}

      {canChangeEnd && !editingEnd && (
        <button
          type="button"
          onClick={() => {
            setEndDraft(request.endDate.slice(0, 10));
            setEndError("");
            setEditingEnd(true);
          }}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Change end date
        </button>
      )}

      {editingEnd && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <label htmlFor={`end-${request.id}`} className="block text-xs font-medium text-gray-700">
            Last day off
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              id={`end-${request.id}`}
              type="date"
              value={endDraft}
              min={request.startDate.slice(0, 10)}
              onChange={(e) => setEndDraft(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <Button size="sm" onClick={saveEndDate} disabled={savingEnd || !endDraft}>
              {savingEnd ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingEnd(false)}>
              Cancel
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            Off longer, or back early? This keeps it as one absence
            {request.leaveType.name.includes("SSP") ? ", and SSP is recalculated" : ""}.
          </p>
          {endError && <p className="mt-1.5 text-xs text-red-700">{endError}</p>}
        </div>
      )}

      {changedRange && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-emerald-700">End date updated.</p>
          {regionsEnabled && request.user.regionId && (
            <RegionalCoverWarning
              startDate={changedRange.start}
              endDate={changedRange.end}
              userId={request.user.id}
              excludeRequestId={request.id}
              variant="logged"
            />
          )}
        </div>
      )}

      {canReview && request.status === "PENDING" && (
        <div className="mt-2">
          <CoverageWarning
            userId={request.user.id}
            startDate={request.startDate}
            endDate={request.endDate}
            canReassign
          />
        </div>
      )}

      {regionsEnabled && request.user.regionId && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowCover((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            {showCover ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Cover by location
            {request.coverOverride && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                Override
              </span>
            )}
          </button>
          {showCover && (
            <div className="mt-2">
              <RegionalCoverPanel
                leaveRequestId={request.id}
                startDate={request.startDate}
                endDate={request.endDate}
                coverOverride={request.coverOverride}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverageWarning } from "./coverage-warning";
import { formatDateRange, countWeekdays } from "@/lib/utils";
import { Check, X } from "lucide-react";

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
  user: {
    id: string;
    name: string;
    email: string;
    memberType: string;
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
  onAction,
  balance,
}: {
  request: LeaveRequest;
  canReview: boolean;
  canCancel: boolean;
  onAction?: (id: string, status: string) => void;
  balance?: LeaveBalance | null;
}) {
  const days = countWeekdays(
    new Date(request.startDate),
    new Date(request.endDate)
  );

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
              {days} day{days !== 1 ? "s" : ""}
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

          {balance && canReview && request.status === "PENDING" && (
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
        {request.status === "PENDING" && (canReview || canCancel) && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {canReview && (
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
            {canCancel && (
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
      {request.status === "PENDING" && (canReview || canCancel) && (
        <div className="mt-2 flex items-center gap-1.5 sm:hidden">
          {canReview && (
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
          {canCancel && (
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
    </div>
  );
}

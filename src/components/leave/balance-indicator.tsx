"use client";

import { AlertTriangle, CheckCircle } from "lucide-react";

type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
};

export function BalanceIndicator({
  balance,
  requestedDays,
  loading,
}: {
  balance: LeaveBalance | null;
  requestedDays: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-400">Checking balance...</p>
      </div>
    );
  }

  if (!balance) return null;

  const wouldExceed = requestedDays > balance.remaining;
  const afterRequest = balance.remaining - requestedDays;

  return (
    <div
      className={`rounded-lg border p-3 ${
        wouldExceed
          ? "border-red-200 bg-red-50"
          : "border-green-200 bg-green-50"
      }`}
    >
      <div className="flex items-start gap-2">
        {wouldExceed ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500 shrink-0" />
        ) : (
          <CheckCircle className="mt-0.5 h-4 w-4 text-green-500 shrink-0" />
        )}
        <div className="flex-1">
          <p
            className={`text-sm font-medium ${
              wouldExceed ? "text-red-700" : "text-green-700"
            }`}
          >
            {wouldExceed
              ? `Exceeds your remaining balance by ${Math.abs(afterRequest)} day${Math.abs(afterRequest) !== 1 ? "s" : ""}`
              : `${balance.remaining} day${balance.remaining !== 1 ? "s" : ""} remaining`}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
            <span>Allowance: {balance.allowance}</span>
            <span>Used: {balance.used}</span>
            {balance.pending > 0 && <span>Pending: {balance.pending}</span>}
            <span>This request: {requestedDays} day{requestedDays !== 1 ? "s" : ""}</span>
          </div>
          {wouldExceed && (
            <p className="mt-1.5 text-xs text-red-600">
              You can still submit this request, but it may be rejected by your
              manager.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

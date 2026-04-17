"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";

type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  allowance: number;
  proRatedEntitlement?: number;
  used: number;
  pending: number;
  remaining: number;
  carryOver: {
    carried: number;
    remaining: number;
    expiresAt: string | null;
  };
};

export function LeaveBalances({ balances }: { balances: LeaveBalance[] }) {
  if (balances.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-brand-500" />
          Your leave balances
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {balances.map((balance) => {
            const usedPercent =
              balance.allowance > 0
                ? Math.min(100, (balance.used / balance.allowance) * 100)
                : 0;
            const pendingPercent =
              balance.allowance > 0
                ? Math.min(
                    100 - usedPercent,
                    (balance.pending / balance.allowance) * 100
                  )
                : 0;
            const isLow = balance.remaining <= 3 && balance.allowance > 0;

            return (
              <div key={balance.leaveTypeId}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: balance.leaveTypeColor }}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {balance.leaveTypeName}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-sm font-bold ${
                        isLow ? "text-red-600" : "text-gray-900"
                      }`}
                    >
                      {balance.remaining}
                    </span>
                    <span className="text-xs text-gray-400">
                      / {balance.allowance} remaining
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="flex h-full">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${usedPercent}%`,
                        backgroundColor: balance.leaveTypeColor,
                      }}
                    />
                    {pendingPercent > 0 && (
                      <div
                        className="h-full transition-all duration-300 opacity-40"
                        style={{
                          width: `${pendingPercent}%`,
                          backgroundColor: balance.leaveTypeColor,
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Details row */}
                <div className="mt-1 flex gap-3 text-[11px] text-gray-400">
                  <span>{balance.used} used</span>
                  {balance.pending > 0 && (
                    <span>{balance.pending} pending</span>
                  )}
                  {balance.proRatedEntitlement !== undefined && (
                    <span>pro-rated {balance.proRatedEntitlement} days</span>
                  )}
                  {balance.carryOver.remaining > 0 && (
                    <span>
                      carry-over {balance.carryOver.remaining}
                      {balance.carryOver.expiresAt ? ` (expires ${new Date(balance.carryOver.expiresAt).toLocaleDateString()})` : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

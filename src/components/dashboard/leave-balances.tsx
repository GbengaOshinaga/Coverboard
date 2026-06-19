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
    expired: boolean;
  };
};

/**
 * How a non-accruing leave type (no annual allowance) is taken, so we describe
 * it rather than showing a misleading "0 days". SSP is an earnings-based
 * payment tracked per sickness episode; unpaid/other types are by arrangement.
 */
function natureLabel(name: string): string {
  return /ssp|sick/i.test(name) ? "Tracked per absence" : "By arrangement";
}

function BalanceCard({
  balance,
  prominent = false,
}: {
  balance: LeaveBalance;
  prominent?: boolean;
}) {
  const isAccruing = balance.allowance > 0;
  const usedPercent = isAccruing
    ? Math.min(100, (balance.used / balance.allowance) * 100)
    : 0;
  const pendingPercent = isAccruing
    ? Math.min(100 - usedPercent, (balance.pending / balance.allowance) * 100)
    : 0;
  const isLow = isAccruing && balance.remaining <= 3;

  return (
    <div
      className={
        prominent
          ? "rounded-xl border border-brand-100 bg-brand-50/40 p-4"
          : "rounded-lg border border-gray-100 p-3 transition-colors hover:border-gray-200 hover:bg-gray-100"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`min-w-0 truncate text-sm ${
            prominent
              ? "font-semibold text-gray-900"
              : "font-medium text-gray-700"
          }`}
        >
          {balance.leaveTypeName}
        </span>
        <div className="flex shrink-0 items-baseline gap-1">
          {isAccruing ? (
            <>
              <span
                className={`font-bold ${prominent ? "text-2xl" : "text-sm"} ${
                  isLow ? "text-red-600" : "text-gray-900"
                }`}
              >
                {balance.remaining}
              </span>
              <span className="text-xs text-gray-400">
                / {balance.allowance} {prominent ? "days left" : "remaining"}
              </span>
            </>
          ) : (
            <span className="text-xs font-medium text-gray-500">
              {natureLabel(balance.leaveTypeName)}
            </span>
          )}
        </div>
      </div>

      {/* Thin progress bar for accruing types — shown even at 0% so the row
          reads as a live metric, not static text. Non-accruing types have no
          allowance to fill, so they show their nature label instead. */}
      {isAccruing ? (
        <div
          className={`${
            prominent ? "h-2" : "h-1.5"
          } w-full overflow-hidden rounded-full bg-gray-200`}
        >
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
                className="h-full opacity-40 transition-all duration-300"
                style={{
                  width: `${pendingPercent}%`,
                  backgroundColor: balance.leaveTypeColor,
                }}
              />
            )}
          </div>
        </div>
      ) : (
        // Reserve the bar's height so accruing and non-accruing cards line up.
        <div aria-hidden className="h-1.5" />
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
          <span>{balance.used} used</span>
          {balance.pending > 0 && <span>{balance.pending} pending</span>}
          {balance.proRatedEntitlement !== undefined && (
            <span>pro-rated {balance.proRatedEntitlement} days</span>
          )}
          {balance.carryOver.expired ? (
            <span className="text-gray-400">carry-over expired</span>
          ) : (
            balance.carryOver.remaining > 0 && (
              <span>
                carry-over {balance.carryOver.remaining}
                {balance.carryOver.expiresAt
                  ? ` (expires ${new Date(
                      balance.carryOver.expiresAt
                    ).toLocaleDateString()})`
                  : ""}
              </span>
            )
          )}
      </div>
    </div>
  );
}

export function LeaveBalances({ balances }: { balances: LeaveBalance[] }) {
  if (balances.length === 0) return null;

  // Annual leave is the balance employees check most — surface it first and
  // prominently. Match by name, falling back to the first balance so a renamed
  // primary type still leads.
  const annualIndex = balances.findIndex((b) =>
    /annual|holiday/i.test(b.leaveTypeName)
  );
  const primary = annualIndex >= 0 ? balances[annualIndex] : balances[0];
  const rest = balances.filter((b) => b.leaveTypeId !== primary.leaveTypeId);

  // Types the person is actually using sit first, then the rest alphabetically.
  const isEngaged = (b: LeaveBalance) => b.used > 0 || b.pending > 0;
  const others = [
    ...rest
      .filter(isEngaged)
      .sort((a, b) => b.used + b.pending - (a.used + a.pending)),
    ...rest
      .filter((b) => !isEngaged(b))
      .sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName)),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-brand-500" />
          Your leave balances
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <BalanceCard balance={primary} prominent />

        {others.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Other leave types
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {others.map((b) => (
                <BalanceCard key={b.leaveTypeId} balance={b} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

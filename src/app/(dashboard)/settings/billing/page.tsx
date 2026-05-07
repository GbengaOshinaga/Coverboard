"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, CreditCard, FileText } from "lucide-react";

type BillingSummary = {
  plan: string;
  planName: string | null;
  planPriceGbp: number | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  cardAdded: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  deletionScheduledFor: string | null;
  deletionReason: string | null;
  trialExpiredGraceEndsAt: string | null;
  invoices: Array<{
    id: string;
    number: string | null;
    amount: number;
    currency: string;
    status: string | null;
    created: number;
    pdf: string | null;
  }>;
};

const FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export default function BillingPage() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/billing/summary");
    if (res.ok) setSummary(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCancel() {
    setBusy(true);
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      toast("Cancellation scheduled", "success");
      refresh();
    } else {
      toast("Could not cancel", "error");
    }
  }

  async function handleReactivate() {
    setBusy(true);
    const res = await fetch("/api/billing/reactivate", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      toast("Plan reactivated", "success");
      refresh();
    } else {
      toast("Could not reactivate", "error");
    }
  }

  async function handleCancelDeletion() {
    setBusy(true);
    const res = await fetch("/api/account/delete/cancel", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      toast("Deletion canceled — your data is safe", "success");
      refresh();
    } else {
      toast("Could not cancel deletion", "error");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-4">
        <p className="text-sm text-gray-500">Loading billing…</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="mx-auto max-w-2xl py-4">
        <p className="text-sm text-red-700">Could not load billing information.</p>
      </div>
    );
  }

  const status = summary.subscriptionStatus;
  const statusLabel =
    status === "trialing"
      ? "Trialing"
      : status === "active"
      ? "Active"
      : status === "past_due"
      ? "Past due"
      : status === "canceled"
      ? "Canceled"
      : status === "paused"
      ? "Paused"
      : status ?? "—";
  const statusVariant: "default" | "warning" | "outline" =
    status === "active"
      ? "default"
      : status === "past_due" || status === "paused"
      ? "warning"
      : "outline";

  const periodEnd = summary.currentPeriodEnd
    ? FMT.format(new Date(summary.currentPeriodEnd))
    : null;
  const trialEnd = summary.trialEndsAt
    ? FMT.format(new Date(summary.trialEndsAt))
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Billing</h1>
          <p className="text-sm text-gray-500">
            Manage your Coverboard subscription
          </p>
        </div>
      </div>

      {summary.cancelAtPeriodEnd && periodEnd && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Your plan will cancel on {periodEnd}. You can reactivate any time before
          then.{" "}
          <button
            onClick={handleReactivate}
            disabled={busy}
            className="font-medium underline underline-offset-2"
          >
            Reactivate
          </button>
        </div>
      )}

      {summary.deletionScheduledFor && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">
            Your account is scheduled for permanent deletion on{" "}
            {FMT.format(new Date(summary.deletionScheduledFor))}.
          </p>
          <p className="mt-1 text-red-800">
            After that date, all team data, leave records, and billing history
            are irrecoverably deleted.
          </p>
          <button
            onClick={handleCancelDeletion}
            disabled={busy}
            className="mt-2 font-medium underline underline-offset-2"
          >
            Cancel deletion and keep my data
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard size={18} />
            Current plan
          </CardTitle>
          <CardDescription>What you&apos;re paying for right now</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-900">
              {summary.planName ?? summary.plan}
            </span>
            {summary.planPriceGbp !== null && (
              <span className="text-sm text-gray-500">
                £{summary.planPriceGbp}/month
              </span>
            )}
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>

          {status === "trialing" && trialEnd && (
            <p className="text-sm text-gray-600">Trial ends on {trialEnd}</p>
          )}
          {status === "active" && periodEnd && (
            <p className="text-sm text-gray-600">
              Next billing date: {periodEnd}
            </p>
          )}

          {!summary.cardAdded && (
            <Link
              href="/settings/billing/add-payment"
              className="inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Add payment details
            </Link>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href="/settings/billing/change-plan"
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Change plan
            </Link>
            {!summary.cancelAtPeriodEnd && status !== "canceled" && (
              <button
                onClick={() => setConfirming(true)}
                className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Cancel subscription
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText size={18} />
            Recent invoices
          </CardTitle>
          <CardDescription>Last 5 invoices from Stripe</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.invoices.length === 0 ? (
            <p className="text-sm text-gray-500">
              No invoices yet. Your first invoice will appear once the trial ends.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {summary.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatMoney(inv.amount, inv.currency)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {FMT.format(new Date(inv.created * 1000))} · {inv.status}
                    </p>
                  </div>
                  {inv.pdf && (
                    <a
                      href={inv.pdf}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      Download PDF
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Cancel subscription">
        <p className="text-sm text-gray-700">
          Your access will continue until{" "}
          <strong>{periodEnd ?? "your current period end"}</strong>, then your
          account will be locked.
        </p>
        <p className="mt-3 text-sm text-red-700">
          <strong>Important:</strong> All your data will be permanently deleted
          30 days after that date unless you reactivate.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Keep my plan
          </button>
          <Button
            onClick={handleCancel}
            disabled={busy}
            className="bg-red-600 hover:bg-red-700"
          >
            Cancel subscription
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

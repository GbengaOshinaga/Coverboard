"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, CreditCard, FileText } from "lucide-react";
import { BillingTaxSection, type TaxId } from "@/components/billing/tax-section";

type BillingSummary = {
  plan: string;
  planName: string | null;
  planPriceGbp: number | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  cardAdded: boolean;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  cancelAtPeriodEnd: boolean;
  pendingDowngradeToFree?: boolean;
  currentPeriodEnd: string | null;
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
  billingCountry: string | null;
  taxIds: TaxId[];
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

  async function handleDowngradeToFree() {
    setBusy(true);
    const res = await fetch("/api/billing/downgrade-to-free", {
      method: "POST",
    });
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      toast(
        "Switching to Free. You'll keep paid access until your current period ends.",
        "success"
      );
      refresh();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast(data.error ?? "Could not switch to Free", "error");
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

  const accessEndsAt = summary.currentPeriodEnd ?? summary.trialEndsAt;
  const accessEndsLabel = accessEndsAt
    ? FMT.format(new Date(accessEndsAt))
    : null;
  const trialEnd = summary.trialEndsAt
    ? FMT.format(new Date(summary.trialEndsAt))
    : null;
  const periodEnd = summary.currentPeriodEnd
    ? FMT.format(new Date(summary.currentPeriodEnd))
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

      {summary.cancelAtPeriodEnd && (
        <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {summary.pendingDowngradeToFree ? (
              accessEndsLabel ? (
                <>
                  You&rsquo;re moving to the <strong>Free</strong> tier on{" "}
                  <strong>{accessEndsLabel}</strong>. You keep paid features
                  until then.{" "}
                  <span className="text-amber-900/70">
                    Reactivate to stay on your current plan.
                  </span>
                </>
              ) : (
                <>
                  You&rsquo;re moving to the <strong>Free</strong> tier at the
                  end of this billing period. Reactivate to stay on your
                  current plan.
                </>
              )
            ) : accessEndsLabel ? (
              <>
                Your plan is scheduled to cancel on{" "}
                <strong>{accessEndsLabel}</strong>. You keep access until then.{" "}
                Reactivate anytime to keep billing and avoid data deletion.
              </>
            ) : (
              <>
                Your subscription is scheduled to cancel at the end of the
                current period. You keep access until then. Reactivate
                anytime to keep billing and avoid data deletion.
              </>
            )}
          </p>
          <Button
            size="sm"
            className="shrink-0 bg-amber-800 hover:bg-amber-900"
            onClick={handleReactivate}
            disabled={busy}
          >
            Reactivate subscription
          </Button>
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

          {summary.cardAdded && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-sm text-gray-700">
                {summary.paymentMethodLast4 ? (
                  <>
                    Card on file:{" "}
                    <span className="font-medium capitalize text-gray-900">
                      {summary.paymentMethodBrand ?? "Card"} •••• {summary.paymentMethodLast4}
                    </span>
                  </>
                ) : (
                  <span className="font-medium text-gray-900">Payment method on file</span>
                )}
              </p>
              <Link
                href="/settings/billing/add-payment?update=1"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Update card
              </Link>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {summary.cancelAtPeriodEnd ? (
              <Button
                size="sm"
                onClick={handleReactivate}
                disabled={busy}
              >
                Reactivate subscription
              </Button>
            ) : (
              <>
                <Link
                  href="/settings/billing/change-plan"
                  className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Change plan
                </Link>
                {status !== "canceled" && (
                  <button
                    onClick={() => setConfirming(true)}
                    className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Cancel subscription
                  </button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <BillingTaxSection
        billingCountry={summary.billingCountry}
        taxIds={summary.taxIds ?? []}
        onChanged={refresh}
      />

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

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Cancel subscription"
        className="max-w-lg"
      >
        <p className="text-sm text-gray-700">
          Before you go — there are two ways to stop paying. Pick whichever
          fits.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm font-semibold text-brand-900">
              Switch to the Free tier
            </p>
            <p className="mt-1 text-xs text-brand-900/80">
              Keep your account, your team, and your data — for free, up to 5
              employees. You&rsquo;ll keep your current paid features until{" "}
              <strong>{periodEnd ?? "the end of this period"}</strong>, then
              automatically move to Free. No refund for time already paid;
              nothing else charged.
            </p>
            <Button
              onClick={handleDowngradeToFree}
              disabled={busy}
              size="sm"
              className="mt-3"
            >
              Switch to Free
            </Button>
          </div>

          <div className="rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">
              Cancel everything
            </p>
            <p className="mt-1 text-xs text-red-900/80">
              Access ends on{" "}
              <strong>{periodEnd ?? "your current period end"}</strong>, then
              your account is locked. <strong>All your data is
              permanently deleted 30 days after that</strong> unless you
              reactivate.
            </p>
            <Button
              onClick={handleCancel}
              disabled={busy}
              size="sm"
              className="mt-3 bg-red-600 hover:bg-red-700"
            >
              Cancel and delete
            </Button>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setConfirming(false)}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Keep my plan
          </button>
        </div>
      </Dialog>
    </div>
  );
}

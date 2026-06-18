"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type BillingSummary = {
  plan: string;
  planName: string | null;
  planPriceGbp: number | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  cardAdded: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

type PlanKey = "starter" | "growth" | "scale" | "pro";

const PLANS: ReadonlyArray<{
  key: PlanKey;
  name: string;
  priceGbp: number;
  blurb: string;
  features: string[];
}> = [
  {
    key: "starter",
    name: "Starter",
    priceGbp: 19,
    blurb: "For growing UK teams",
    features: [
      "Annual leave & team calendar",
      "Pro-rata for part-time",
      "Custom carry-over rules",
      "Bank holiday region config",
      "Up to 15 employees, 2 admins",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    priceGbp: 49,
    blurb: "Stay compliant",
    features: [
      "Everything in Starter",
      "SSP / SMP / SPL trackers",
      "Bradford Factor reporting",
      "Right to work tracking",
      "Unlimited employees, 5 admins",
    ],
  },
  {
    key: "scale",
    name: "Scale",
    priceGbp: 99,
    blurb: "Understand your workforce",
    features: [
      "Everything in Growth",
      "Absence trend analysis",
      "Custom leave policy builder",
      "Scheduled compliance reports",
      "Leave operations dashboard",
      "Unlimited admins",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    priceGbp: 179,
    blurb: "Enterprise-ready",
    features: [
      "Everything in Scale",
      "Activity log — see who viewed each profile, sickness note, and report",
      "Audit trail + SAR exports",
      "Priority email support (2 working-day target)",
    ],
  },
];

const FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function currentPlanKeyFromName(name: string | null): PlanKey | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower === "starter" || lower === "growth" || lower === "scale" || lower === "pro") {
    return lower;
  }
  return null;
}

export default function ChangePlanPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/billing/summary");
      if (!cancelled) {
        if (res.ok) setSummary(await res.json());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentPlanKey = useMemo(
    () => (summary ? currentPlanKeyFromName(summary.planName) : null),
    [summary]
  );

  // Free users see the same grid but every "Switch to X" routes to the
  // add-payment page with the chosen plan preselected — they need to add
  // a card AND pick a tier in one step, which the change-plan API can't do.
  const isFreePlan = summary?.plan === "FREE";

  const blockingReason: string | null = useMemo(() => {
    if (!summary) return null;
    // Free → Paid is a different flow, not a block. Handled below.
    if (isFreePlan) return null;
    if (!summary.cardAdded) {
      return "Add a payment method before changing plan.";
    }
    if (summary.cancelAtPeriodEnd) {
      return "Reactivate your subscription before changing plan.";
    }
    const status = summary.subscriptionStatus;
    if (status === "canceled" || status === "paused" || status === "past_due") {
      return "Your subscription is not in a state that allows plan changes.";
    }
    return null;
  }, [summary, isFreePlan]);

  function startPlanChange(planKey: PlanKey) {
    if (isFreePlan) {
      // Free user upgrading — they need to pick a tier AND add a card,
      // which the change-plan endpoint can't do. Hand off to add-payment
      // with the chosen plan as a query param.
      router.push(`/settings/billing/add-payment?plan=${planKey}`);
      return;
    }
    setPendingPlan(planKey);
  }

  const isTrialing = summary?.subscriptionStatus === "trialing";
  const periodEnd = summary?.currentPeriodEnd
    ? FMT.format(new Date(summary.currentPeriodEnd))
    : null;
  const trialEnd = summary?.trialEndsAt
    ? FMT.format(new Date(summary.trialEndsAt))
    : null;

  async function handleConfirm() {
    if (!pendingPlan) return;
    setBusy(true);
    const res = await fetch("/api/billing/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planKey: pendingPlan }),
    });
    setBusy(false);
    if (res.ok) {
      const data = (await res.json()) as { planName: string };
      setPendingPlan(null);
      toast(`Switched to ${data.planName}`, "success");
      router.push("/settings/billing");
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast(data.error ?? "Could not change plan", "error");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-4">
        <p className="text-sm text-gray-500">Loading plans…</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="mx-auto max-w-4xl py-4">
        <p className="text-sm text-red-700">Could not load billing information.</p>
      </div>
    );
  }

  const pending = pendingPlan ? PLANS.find((p) => p.key === pendingPlan) : null;
  const currentPlanForDialog = currentPlanKey
    ? PLANS.find((p) => p.key === currentPlanKey)
    : null;
  const isUpgrade =
    pending && currentPlanForDialog
      ? pending.priceGbp > currentPlanForDialog.priceGbp
      : false;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <div className="flex items-center gap-3">
        <Link
          href="/settings/billing"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Change plan</h1>
          <p className="text-sm text-gray-500">
            Switch tiers any time. Changes take effect immediately.
          </p>
        </div>
      </div>

      {blockingReason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {blockingReason}{" "}
          {!summary.cardAdded && (
            <Link
              href="/settings/billing/add-payment"
              className="font-medium underline underline-offset-2"
            >
              Add payment details
            </Link>
          )}
          {summary.cancelAtPeriodEnd && (
            <Link
              href="/settings/billing"
              className="font-medium underline underline-offset-2"
            >
              Reactivate on billing →
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === currentPlanKey;
          return (
            <Card
              key={plan.key}
              className={`flex h-full flex-col ${isCurrent ? "border-brand-500" : ""}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent && <Badge variant="default">Current</Badge>}
                </div>
                <CardDescription>{plan.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <div>
                  <p className="text-2xl font-semibold text-gray-900">
                    £{plan.priceGbp}
                    <span className="text-sm font-normal text-gray-500">/month</span>
                  </p>
                  <p className="text-xs text-gray-400">Excl. VAT where applicable</p>
                </div>
                <ul className="min-h-0 flex-1 space-y-2 text-sm text-gray-700">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-brand-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => startPlanChange(plan.key)}
                  disabled={isCurrent || Boolean(blockingReason)}
                  className="mt-auto w-full shrink-0"
                  variant={isCurrent ? "outline" : "default"}
                >
                  {isCurrent
                    ? "Current plan"
                    : isFreePlan
                    ? `Upgrade to ${plan.name}`
                    : `Switch to ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-gray-500">
        {isFreePlan
          ? "You'll be asked for a card on the next step. Your first invoice is the prorated remainder of the current month; no trial."
          : "Plan changes are prorated. Any unused time on your current plan is credited toward the new plan on your next invoice."}
      </p>

      <Dialog
        open={Boolean(pending)}
        onClose={() => (busy ? null : setPendingPlan(null))}
        title={pending ? `Switch to ${pending.name}?` : ""}
      >
        {pending && (
          <>
            <p className="text-sm text-gray-700">
              You&apos;ll move to{" "}
              <strong>
                {pending.name} (£{pending.priceGbp}/month)
              </strong>{" "}
              right away.
            </p>
            {isTrialing ? (
              <p className="mt-3 text-sm text-gray-700">
                You&apos;re still on trial{trialEnd ? ` until ${trialEnd}` : ""}, so
                you won&apos;t be charged until then. Your first invoice will reflect
                the new plan.
              </p>
            ) : (
              <p className="mt-3 text-sm text-gray-700">
                {isUpgrade
                  ? "You'll see a prorated charge for the rest of this billing period on your next invoice."
                  : "Unused time on your current plan will be credited toward your next invoice."}
                {periodEnd ? ` Next billing date: ${periodEnd}.` : ""}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingPlan(null)}
                disabled={busy}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <Button onClick={handleConfirm} disabled={busy}>
                {busy ? "Switching…" : `Confirm switch to ${pending.name}`}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

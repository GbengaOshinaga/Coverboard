"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Lock } from "lucide-react";

type Props = {
  publishableKey: string;
  planName: string;
  planPriceGbp: number;
  trialEndFormatted: string;
  alreadyAdded: boolean;
  updateMode?: boolean;
  /**
   * Non-null when this is a Free → Paid upgrade. The chosen tier is
   * forwarded to /api/billing/confirm-payment, which creates the
   * subscription on that tier (no trial — they've already used the
   * product on Free).
   */
  upgradeToPlanKey?: "starter" | "growth" | "scale" | "pro" | null;
};

export function AddPaymentForm({
  publishableKey,
  planName,
  planPriceGbp,
  trialEndFormatted,
  alreadyAdded,
  updateMode = false,
  upgradeToPlanKey = null,
}: Props) {
  const isUpgrade = upgradeToPlanKey !== null;
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [stripePromise] = useState<Promise<StripeJs | null> | null>(() =>
    publishableKey ? loadStripe(publishableKey) : null
  );

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/billing/setup-intent", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setInitError(data.error ?? "Could not start payment setup");
        return;
      }
      const data = await res.json();
      setClientSecret(data.clientSecret);
    }
    init();
  }, []);

  // Free → Paid upgrade: even if `cardAdded` is true (e.g. the org was
  // previously on a paid plan, downgraded to Free, and is now coming back),
  // we still need them to confirm — that's how the subscription gets
  // created. So skip the "already added" short-circuit when upgrading.
  if (alreadyAdded && !updateMode && !isUpgrade) {
    return (
      <>
        <Header updateMode={false} isUpgrade={false} />
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Your card is on file</p>
                <p className="mt-1">
                  Your {planName} plan
                  {trialEndFormatted ? ` will activate on ${trialEndFormatted}` : ""}.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Link
                href="/settings/billing/add-payment?update=1"
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Update payment method
              </Link>
              <Link
                href="/settings/billing"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Back to billing
              </Link>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (!publishableKey) {
    return (
      <>
        <Header updateMode={false} isUpgrade={isUpgrade} planName={planName} />
        <Card>
          <CardContent className="pt-6 text-sm text-gray-700">
            Billing is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and
            try again.
          </CardContent>
        </Card>
      </>
    );
  }

  if (initError) {
    return (
      <>
        <Header updateMode={false} isUpgrade={isUpgrade} planName={planName} />
        <Card>
          <CardContent className="pt-6 text-sm text-red-700">
            {initError}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <Header updateMode={updateMode} isUpgrade={isUpgrade} planName={planName} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isUpgrade
              ? `Subscribe to ${planName}`
              : updateMode
              ? "Update payment method"
              : "Add a payment method"}
          </CardTitle>
          <CardDescription>
            {isUpgrade
              ? `Your card will be charged £${planPriceGbp}/month (excl. VAT). No trial — Free customers go straight to paid.`
              : updateMode
              ? "Enter new card details. Future invoices will use this card."
              : trialEndFormatted
                ? `Your card will be charged £${planPriceGbp}/month starting ${trialEndFormatted}.`
                : `Your card will be charged £${planPriceGbp}/month after you confirm.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clientSecret && stripePromise ? (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: { theme: "stripe" } }}
            >
              <InnerForm
                planName={planName}
                updateMode={updateMode}
                upgradeToPlanKey={upgradeToPlanKey}
              />
            </Elements>
          ) : (
            <p className="text-sm text-gray-500">Loading secure payment form…</p>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
            <Lock size={12} />
            <span>Secured by Stripe. Coverboard never sees your card details.</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Header({
  updateMode,
  isUpgrade,
  planName,
}: {
  updateMode: boolean;
  isUpgrade: boolean;
  planName?: string;
}) {
  const title = isUpgrade
    ? `Upgrade to ${planName ?? "paid"}`
    : updateMode
    ? "Update payment method"
    : "Add payment details";
  const subtitle = isUpgrade
    ? "Add a card to activate your subscription"
    : updateMode
    ? "Replace the card used for your Coverboard subscription"
    : "Keep your Coverboard access after the trial ends";
  return (
    <div className="mb-6 flex items-center gap-3">
      <Link
        href="/settings/billing"
        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <ArrowLeft size={18} />
      </Link>
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{title}</h1>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
}

function InnerForm({
  planName,
  updateMode,
  upgradeToPlanKey,
}: {
  planName: string;
  updateMode: boolean;
  upgradeToPlanKey: "starter" | "growth" | "scale" | "pro" | null;
}) {
  const isUpgrade = upgradeToPlanKey !== null;
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      if (result.error.code === "card_declined") {
        setError("Your card was declined. Please try a different card.");
      } else {
        setError(result.error.message ?? "Something went wrong. Please try again.");
      }
      setSubmitting(false);
      return;
    }

    const paymentMethodId =
      typeof result.setupIntent?.payment_method === "string"
        ? result.setupIntent.payment_method
        : result.setupIntent?.payment_method?.id;

    if (!paymentMethodId) {
      setError("Could not read payment method from Stripe. Please retry.");
      setSubmitting(false);
      return;
    }

    const confirm = await fetch("/api/billing/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethodId,
        ...(upgradeToPlanKey ? { planKey: upgradeToPlanKey } : {}),
      }),
    });
    if (!confirm.ok) {
      const data = await confirm.json().catch(() => ({}));
      setError(data.error ?? "Could not attach card to subscription.");
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
    // Re-fetch the dashboard layout so the trial banner picks up cardAdded=true.
    router.refresh();
  }

  if (success) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle size={18} className="mt-0.5 shrink-0" />
          <p>
            {isUpgrade
              ? `You're on the ${planName} plan. Welcome aboard.`
              : updateMode
              ? "Your payment method has been updated."
              : `You're all set. Your ${planName} plan is ready to activate when the trial ends.`}
          </p>
        </div>
        <Link
          href="/settings/billing"
          className="inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Back to billing
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      <Button type="submit" disabled={submitting || !stripe} className="w-full">
        {submitting
          ? "Saving…"
          : isUpgrade
            ? `Subscribe to ${planName}`
            : updateMode
              ? "Save new card"
              : "Save card & activate plan"}
      </Button>
    </form>
  );
}

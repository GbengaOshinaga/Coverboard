"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
};

export function AddPaymentForm({
  publishableKey,
  planName,
  planPriceGbp,
  trialEndFormatted,
  alreadyAdded,
}: Props) {
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

  if (alreadyAdded) {
    return (
      <>
        <Header />
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
            <div className="mt-4 flex justify-end">
              <Link
                href="/dashboard"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Back to dashboard
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
        <Header />
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
        <Header />
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
      <Header />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a payment method</CardTitle>
          <CardDescription>
            {trialEndFormatted
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
              <InnerForm planName={planName} />
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

function Header() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <Link
        href="/settings/billing"
        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <ArrowLeft size={18} />
      </Link>
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          Add payment details
        </h1>
        <p className="text-sm text-gray-500">
          Keep your Coverboard access after the trial ends
        </p>
      </div>
    </div>
  );
}

function InnerForm({ planName }: { planName: string }) {
  const stripe = useStripe();
  const elements = useElements();
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
      body: JSON.stringify({ paymentMethodId }),
    });
    if (!confirm.ok) {
      const data = await confirm.json().catch(() => ({}));
      setError(data.error ?? "Could not attach card to subscription.");
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
  }

  if (success) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle size={18} className="mt-0.5 shrink-0" />
          <p>
            You&apos;re all set. Your {planName} plan is ready to activate when
            the trial ends.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Back to dashboard
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
        {submitting ? "Saving…" : "Save card & activate plan"}
      </Button>
    </form>
  );
}

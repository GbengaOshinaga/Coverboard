"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PRICING } from "@/config/pricing";
import { trackClient, AnalyticsEvents } from "@/lib/analytics";
import {
  BILLING_COUNTRIES,
  DEFAULT_BILLING_COUNTRY,
} from "@/config/billing-countries";

type PlanKey = "starter" | "growth" | "scale" | "pro";

const PLAN_TIER_NAMES: Record<PlanKey, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  pro: "Pro",
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselected = (searchParams.get("plan") ?? "growth").toLowerCase();
  const initialPlan: PlanKey = (["starter", "growth", "scale", "pro"] as PlanKey[])
    .includes(preselected as PlanKey)
    ? (preselected as PlanKey)
    : "growth";

  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<PlanKey>(initialPlan);
  const [billingCountry, setBillingCountry] = useState(DEFAULT_BILLING_COUNTRY);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          orgName,
          plan,
          billingCountry,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error ?? "Signup failed";
        setError(errorMsg);
        trackClient(AnalyticsEvents.SIGNUP_FAILED, {
          reason: errorMsg,
          selected_plan: plan,
        });
        setLoading(false);
        return;
      }

      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.ok) {
        router.push("/onboarding");
      } else {
        router.push("/login");
      }
    } catch {
      setError("Something went wrong");
      trackClient(AnalyticsEvents.SIGNUP_FAILED, {
        reason: "network_error",
        selected_plan: plan,
      });
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-lg">
            CB
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Start managing your team&apos;s leave
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            14-day free trial. No card required.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            If you don&apos;t subscribe, all data is permanently deleted within
            30 days.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create your team</CardTitle>
            <CardDescription>
              We&apos;ll set up your organization and make you the admin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Choose a plan
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PLAN_TIER_NAMES) as PlanKey[]).map((k) => {
                    const tier = PRICING.tiers.find(
                      (t) => t.name === PLAN_TIER_NAMES[k]
                    );
                    const selected = plan === k;
                    return (
                      <button
                        type="button"
                        key={k}
                        onClick={() => setPlan(k)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          selected
                            ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600"
                            : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}
                      >
                        <div className="text-sm font-semibold text-gray-900">
                          {PLAN_TIER_NAMES[k]}
                        </div>
                        <div className="text-xs text-gray-500">
                          £{tier?.price_monthly}/month
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  You can change this later. Nothing charged during the 14-day trial.
                  Prices shown are exclusive of VAT or local taxes, which we
                  calculate at checkout based on your billing country.
                </p>
              </div>
              <Input
                id="orgName"
                label="Team / company name"
                type="text"
                placeholder="e.g. Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
              <div>
                <label
                  htmlFor="billingCountry"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Billing country
                </label>
                <select
                  id="billingCountry"
                  value={billingCountry}
                  onChange={(e) => setBillingCountry(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                >
                  {BILLING_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Used for VAT calculation. You can add a VAT number after
                  signup in billing settings.
                </p>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Your account
                </p>
                <div className="space-y-4">
                  <Input
                    id="name"
                    label="Full name"
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <Input
                    id="email"
                    label="Work email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    id="password"
                    label="Password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating your team..." : "Start 14-day free trial"}
              </Button>
              <p className="text-center text-xs text-gray-500">
                By creating an account you agree to our{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="font-medium text-brand-600 hover:underline"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="font-medium text-brand-600 hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </form>
            <div className="mt-4 text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-brand-600 hover:text-brand-500"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

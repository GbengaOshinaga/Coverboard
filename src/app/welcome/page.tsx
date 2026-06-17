"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PRICING } from "@/config/pricing";

type PlanKey = "free" | "starter" | "growth" | "scale" | "pro";

const PLAN_TIER_NAMES: Record<PlanKey, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  pro: "Pro",
};

const ALL_PLAN_KEYS: PlanKey[] = ["free", "starter", "growth", "scale", "pro"];

export default function WelcomePage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [orgName, setOrgName] = useState("");
  const [plan, setPlan] = useState<PlanKey>("growth");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Not signed in → send to login (middleware normally prevents landing here
  // without a session, but guard against a direct visit).
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, plan }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't create your team. Please try again.");
        setLoading(false);
        return;
      }

      // Refresh the JWT so it now carries the new organizationId, then continue
      // into onboarding.
      await update();
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (status === "loading") return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-lg">
            CB
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Create your team
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {plan === "free"
              ? "Free for up to 5 employees. No card required."
              : "14-day free trial. No card required."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Almost there</CardTitle>
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ALL_PLAN_KEYS.map((k) => {
                    const tier = PRICING.tiers.find(
                      (t) => t.name === PLAN_TIER_NAMES[k]
                    );
                    const selected = plan === k;
                    const isFreeTier = k === "free";
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
                          {isFreeTier ? "Free" : `£${tier?.price_monthly}/month`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-400">
                          {tier?.headcount}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  {plan === "free"
                    ? "Upgrade any time from Settings → Billing."
                    : "Nothing charged during the 14-day trial. Prices shown are exclusive of VAT or local taxes, which we calculate at checkout based on your billing country."}
                </p>
              </div>
              <Input
                id="orgName"
                label="Team / company name"
                type="text"
                autoComplete="organization"
                placeholder="e.g. Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "Creating your team..."
                  : plan === "free"
                  ? "Get started"
                  : "Start 14-day free trial"}
              </Button>
            </form>
            {session?.user?.email && (
              <p className="mt-4 text-center text-xs text-gray-400">
                Signed in as {session.user.email} ·{" "}
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="font-medium text-brand-600 hover:text-brand-500"
                >
                  Use a different account
                </button>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

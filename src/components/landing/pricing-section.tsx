"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PRICING, type PricingTier } from "@/config/pricing";

function tierSignupHref(tier: PricingTier) {
  return `/signup?plan=${tier.name.toLowerCase()}`;
}

function PricingCard({ tier }: { tier: PricingTier }) {
  const isFree = tier.price_monthly === 0;
  const signupHref = tierSignupHref(tier);

  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-white p-5 sm:p-6 ${
        tier.highlighted
          ? "border-brand-300 shadow-lg shadow-brand-100/40 ring-2 ring-brand-500/15"
          : "border-gray-200 shadow-sm"
      }`}
    >
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
        <p className="mt-1 text-xs leading-snug text-gray-500">{tier.tagline}</p>

        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {PRICING.currency}
            {tier.price_monthly}
          </span>
          <span className="text-sm text-gray-500">/mo</span>
        </div>
        <p className="mt-1 text-xs font-medium text-gray-600">{tier.headcount}</p>
        {!isFree && (
          <p className="text-[11px] text-gray-400">Excl. VAT where applicable</p>
        )}
      </div>

      <ul className="mt-5 flex-1 space-y-2 border-t border-gray-100 pt-5 text-sm">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-gray-700">
            <Check size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
            <span className="leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={signupHref}
        className={`mt-6 block rounded-xl py-2.5 text-center text-sm font-semibold transition-colors ${
          tier.highlighted
            ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"
            : "border-2 border-brand-600 text-brand-600 hover:bg-brand-50"
        }`}
      >
        {tier.cta}
      </Link>
    </div>
  );
}

const HOMEPAGE_TIERS = ["Free", "Starter", "Growth"];

const upgradePaths = [
  { tierName: "Scale", label: "Advanced HR operations" },
  { tierName: "Pro", label: "Enterprise controls" },
];

export function PricingSection() {
  const tiers = PRICING.tiers.filter((t) => HOMEPAGE_TIERS.includes(t.name));

  return (
    <section id="pricing" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold text-brand-600">Pricing</p>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Start free. Upgrade when you need more.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Minimum cover warnings are included on every plan, even Free.
            Month-to-month, no contract.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {tiers.map((tier) => (
            <PricingCard key={tier.name} tier={tier} />
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-8">
          {upgradePaths.map((u) => {
            const tier = PRICING.tiers.find((t) => t.name === u.tierName);
            if (!tier) return null;
            return (
              <a
                key={u.tierName}
                href="#scale-pro"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                {u.label}
                <span className="font-normal text-gray-500">
                  ({tier.name}, {PRICING.currency}
                  {tier.price_monthly}/mo)
                </span>
                <ArrowRight size={14} aria-hidden />
              </a>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Free up to 5 employees, no card required. Paid plans include a 14-day
          free trial.
        </p>
      </div>
    </section>
  );
}

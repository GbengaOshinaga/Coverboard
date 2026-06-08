"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PRICING, type PricingTier } from "@/config/pricing";

function tierSignupHref(tier: PricingTier) {
  return `/signup?plan=${tier.name.toLowerCase()}`;
}

function PricingCard({
  tier,
  compact = false,
}: {
  tier: PricingTier;
  compact?: boolean;
}) {
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
      {tier.badge && tier.highlighted ? (
        <span className="mb-3 inline-flex w-fit rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
          {tier.badge}
        </span>
      ) : !compact ? (
        <span className="mb-3 block h-[26px]" aria-hidden />
      ) : null}

      <div>
        <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
        <p className="mt-1 text-xs leading-snug text-gray-500">{tier.tagline}</p>

        <div className="mt-4 flex items-baseline gap-1">
          {isFree ? (
            <span className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Free
            </span>
          ) : (
            <>
              <span className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {PRICING.currency}
                {tier.price_monthly}
              </span>
              <span className="text-sm text-gray-500">/mo</span>
            </>
          )}
        </div>
        <p className="mt-1 text-xs font-medium text-gray-600">{tier.headcount}</p>
        {!isFree && (
          <p className="text-[11px] text-gray-400">Excl. VAT where applicable</p>
        )}
      </div>

      <ul
        className={`mt-5 flex-1 space-y-2 border-t border-gray-100 pt-5 ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-gray-700">
            <Check
              size={compact ? 14 : 16}
              className="mt-0.5 shrink-0 text-brand-600"
              aria-hidden
            />
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

export function PricingSection() {
  const topRow = PRICING.tiers.slice(0, 3);
  const bottomRow = PRICING.tiers.slice(3);

  return (
    <section id="pricing" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold text-brand-600">Pricing</p>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Plans that grow with your organisation
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Same core product — add HR depth, compliance reporting, and
            enterprise controls when you need them. No hidden fees.
          </p>
        </div>

        {/* Phone & small tablet: swipeable cards */}
        <div className="lg:hidden">
          <p className="mb-4 text-center text-xs text-gray-500">
            Swipe to compare all plans
          </p>
          <div
            className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-6 pb-2 pt-1 [scrollbar-width:thin]"
            role="region"
            aria-label="Pricing plans"
          >
            {PRICING.tiers.map((tier) => (
              <div
                key={tier.name}
                className="w-[min(88vw,300px)] shrink-0 snap-center sm:w-[300px]"
              >
                <PricingCard tier={tier} compact />
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: 3 + 2 grid */}
        <div className="mx-auto hidden max-w-5xl lg:block">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {topRow.map((tier) => (
              <PricingCard key={tier.name} tier={tier} />
            ))}
          </div>
          <div className="mx-auto mt-5 grid max-w-3xl grid-cols-1 gap-5 md:grid-cols-2">
            {bottomRow.map((tier) => (
              <PricingCard key={tier.name} tier={tier} />
            ))}
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Free up to 5 employees, no card required. Paid plans include a 14-day
          free trial — choose based on the features you need.
        </p>
      </div>
    </section>
  );
}

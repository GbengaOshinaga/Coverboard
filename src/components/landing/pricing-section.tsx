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
      className={`relative flex h-full min-h-0 flex-col rounded-2xl border bg-white p-5 sm:p-6 ${
        tier.highlighted
          ? "border-brand-300 shadow-xl shadow-brand-100/50 ring-2 ring-brand-500/20"
          : "border-gray-200 shadow-sm"
      } ${tier.highlighted && !compact ? "xl:py-7" : ""}`}
    >
      {tier.badge && tier.highlighted && (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
          {tier.badge}
        </div>
      )}

      <div className={tier.highlighted ? "pt-2" : ""}>
        <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
        <p className="mt-0.5 text-xs text-gray-500 leading-snug">{tier.tagline}</p>

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
  const highlightIndex = PRICING.tiers.findIndex((t) => t.highlighted);
  const beforeHighlight = PRICING.tiers.slice(0, Math.max(0, highlightIndex));
  const highlighted =
    highlightIndex >= 0 ? PRICING.tiers[highlightIndex] : undefined;
  const afterHighlight = PRICING.tiers.slice(highlightIndex + 1);

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

        {/* Mobile & tablet: horizontal scroll */}
        <div className="xl:hidden">
          <p className="mb-3 text-center text-xs text-gray-500 sm:hidden">
            Swipe to compare all plans
          </p>
          <div
            className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-6 pb-4 [scrollbar-width:thin]"
            role="region"
            aria-label="Pricing plans"
          >
            {PRICING.tiers.map((tier) => (
              <div
                key={tier.name}
                className="w-[min(100%,280px)] shrink-0 snap-center sm:w-[300px]"
              >
                <PricingCard tier={tier} compact />
              </div>
            ))}
          </div>
        </div>

        {/* Large screens: featured centre + flanking tiers */}
        <div className="hidden xl:block">
          <div className="grid grid-cols-6 items-stretch gap-4">
            {beforeHighlight.map((tier) => (
              <div key={tier.name} className="col-span-1">
                <PricingCard tier={tier} />
              </div>
            ))}
            {highlighted && (
              <div className="col-span-2">
                <PricingCard tier={highlighted} />
              </div>
            )}
            {afterHighlight.map((tier) => (
              <div key={tier.name} className="col-span-1">
                <PricingCard tier={tier} />
              </div>
            ))}
          </div>
        </div>

        {/* Medium-large: 3 + 2 centred rows */}
        <div className="hidden lg:grid xl:hidden lg:grid-cols-3 lg:gap-5 lg:max-w-5xl lg:mx-auto">
          {PRICING.tiers.slice(0, 3).map((tier) => (
            <PricingCard key={tier.name} tier={tier} />
          ))}
        </div>
        <div className="mt-5 hidden lg:grid xl:hidden lg:grid-cols-2 lg:gap-5 lg:max-w-3xl lg:mx-auto">
          {PRICING.tiers.slice(3).map((tier) => (
            <PricingCard key={tier.name} tier={tier} />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Free up to 5 employees, no card required. Paid plans include a 14-day
          free trial — choose based on the features you need.
        </p>
      </div>
    </section>
  );
}

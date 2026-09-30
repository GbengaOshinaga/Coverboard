import type { Metadata } from "next";
import { PRICING } from "@/config/pricing";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";
import { PricingCard } from "@/components/landing/pricing-section";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Staff cover is included on every Coverboard plan, even Free. Pay for team size and the HR extras you need. Month-to-month, no contract.",
  alternates: { canonical: "/pricing" },
};

const faqs = [
  {
    q: "Is cover really on the Free plan?",
    a: "Yes. Minimum cover, shift cover and the list of who's free to cover work on every plan. Paid plans add headcount, admins and HR features.",
  },
  {
    q: "Do I need a card to start?",
    a: "Not for Free (up to 5 employees). Paid plans start with a 14-day free trial.",
  },
  {
    q: "Can I change plan later?",
    a: "Yes. Upgrade, downgrade or move back to Free from your billing settings. Plans are month-to-month with no contract.",
  },
  {
    q: "Are prices inclusive of VAT?",
    a: "No. Prices are in GBP per month, excluding VAT where applicable.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />

      <section className="pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold text-brand-600">Pricing</p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-5xl">
              Cover is included on every plan.
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Pay for team size and the HR extras you need. Month-to-month, no
              contract.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {PRICING.tiers.map((tier) => (
              <PricingCard key={tier.name} tier={tier} />
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-gray-500">
            Free up to 5 employees, no card required. Paid plans include a 14-day
            free trial.
          </p>
        </div>
      </section>

      <section className="border-t border-gray-100 bg-gray-50 py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Questions</h2>
          <dl className="mt-8 divide-y divide-gray-100">
            {faqs.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-semibold text-gray-900">{f.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-gray-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

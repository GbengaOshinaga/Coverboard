import type { Metadata } from "next";
import Link from "next/link";
import { getAppBaseUrl } from "@/lib/app-url";
import { SspCalculator } from "./calculator";

export const dynamic = "force-static";

const TITLE = "Statutory Sick Pay (SSP) Calculator 2026 (UK)";
const DESCRIPTION =
  "Work out UK Statutory Sick Pay under the new 6 April 2026 rules — no waiting days, no Lower Earnings Limit, and the rate capped at 80% of average weekly earnings. Free, no sign-up.";
const PATH = "/tools/ssp-calculator";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "SSP calculator",
    "statutory sick pay calculator UK",
    "SSP 2026 rate",
    "SSP no waiting days",
    "how much SSP will I get",
  ],
  alternates: { canonical: PATH },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: PATH },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "How much is Statutory Sick Pay in 2026?",
    a: "From 6 April 2026, SSP is the lower of £123.25 a week or 80% of the employee's average weekly earnings. Lower earners get 80% of their pay rather than the flat rate.",
  },
  {
    q: "Are there still 3 waiting days before SSP is paid?",
    a: "No. From 6 April 2026 waiting days were abolished — SSP is payable from the first qualifying day of sickness. (Sickness that started before that date still has 3 unpaid waiting days.)",
  },
  {
    q: "Is there a minimum earnings level to get SSP?",
    a: "No. The Lower Earnings Limit eligibility test was removed for SSP from 6 April 2026 — every employee qualifies regardless of earnings.",
  },
  {
    q: "How long can SSP be paid?",
    a: "Up to 28 weeks in any one period of incapacity for work. Linked sickness spells (separated by 8 weeks or less) count toward the same 28-week limit.",
  },
];

export default function SspCalculatorPage() {
  const url = `${getAppBaseUrl()}${PATH}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: TITLE,
        description: DESCRIPTION,
        url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any",
        offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
        publisher: { "@type": "Organization", name: "Coverboard" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <article className="space-y-8">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-sm">
        <Link href="/tools" className="text-brand-600 hover:underline">
          &larr; All tools
        </Link>
      </nav>

      <header className="space-y-3 border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold leading-tight text-gray-900">
          Statutory Sick Pay (SSP) calculator
        </h1>
        <p className="text-base leading-relaxed text-gray-600">
          Work out UK Statutory Sick Pay under the rules in force from{" "}
          <strong>6 April 2026</strong>: paid from day one, no Lower Earnings
          Limit, and capped at the lower of the flat rate or 80% of earnings.
        </p>
      </header>

      <SspCalculator />

      <section className="prose prose-gray max-w-none prose-a:text-brand-600">
        <h2>What changed on 6 April 2026</h2>
        <p>
          The 2026 reform made SSP more generous in three ways. There are no
          longer any <strong>waiting days</strong> — SSP is paid from the first
          qualifying day, not the fourth. The <strong>Lower Earnings Limit</strong>{" "}
          eligibility test was removed, so every employee qualifies regardless of
          earnings. And the rate is now the <strong>lower of £123.25 a week or
          80% of average weekly earnings</strong>, so low earners who previously
          got little or nothing now receive 80% of their pay.
        </p>

        <h2>How SSP is worked out</h2>
        <ul>
          <li>
            <strong>Weekly rate</strong> = lower of £123.25 or 80% × average
            weekly earnings.
          </li>
          <li>
            <strong>Daily rate</strong> = weekly rate ÷ the employee&apos;s
            qualifying (working) days per week — so a 3-day-a-week worker has a
            higher daily rate than a 5-day worker.
          </li>
          <li>
            <strong>Total</strong> = daily rate × the qualifying days off sick,
            up to a maximum of 28 weeks per period of incapacity.
          </li>
        </ul>

        <h2>Frequently asked</h2>
        {FAQ.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}

        <h2>Related reading</h2>
        <ul>
          <li>
            <Link href="/guides/ssp-changes-2026">
              SSP changes April 2026 — what employers need to do
            </Link>
          </li>
          <li>
            <Link href="/guides/uk-statutory-leave-types">
              UK statutory leave types explained
            </Link>
          </li>
        </ul>
      </section>

      <aside className="rounded-lg border border-brand-100 bg-brand-50 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Track sick pay automatically
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">
          Coverboard calculates SSP on the new 2026 rules for every UK
          employee — daily rate, the 28-week cap and linked spells — using the
          exact method behind this calculator.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Start free
        </Link>
      </aside>
    </article>
  );
}

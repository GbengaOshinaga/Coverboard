import type { Metadata } from "next";
import Link from "next/link";
import { getAppBaseUrl } from "@/lib/app-url";
import { IrregularHoursCalculator } from "./calculator";

export const dynamic = "force-static";

const TITLE = "Irregular Hours & Zero-Hours Holiday Calculator (UK, 12.07%)";
const DESCRIPTION =
  "Work out holiday entitlement for irregular-hours, zero-hours and part-year workers using the UK statutory 12.07% accrual method (2024 rules). Free, no sign-up.";
const PATH = "/tools/irregular-hours-holiday-calculator";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "zero hours holiday calculator",
    "irregular hours holiday entitlement",
    "12.07% holiday pay calculator",
    "part-year worker holiday UK",
    "holiday accrual calculator UK",
  ],
  alternates: { canonical: PATH },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: PATH },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "How is holiday calculated for zero-hours and irregular-hours workers?",
    a: "Since April 2024, holiday for irregular-hours and part-year workers accrues at 12.07% of the hours actually worked in each pay period. The 12.07% comes from the statutory 5.6 weeks' holiday divided by the remaining 46.4 working weeks of the year (5.6 ÷ 46.4 = 12.07%).",
  },
  {
    q: "Do irregular-hours workers get bank holidays on top?",
    a: "No. The 12.07% accrual already represents the worker's full statutory holiday, including any bank holidays. There is no separate bank-holiday entitlement added on top.",
  },
  {
    q: "Is holiday measured in hours or days for these workers?",
    a: "In hours. Because the hours worked vary, entitlement accrues and is taken in hours. A days figure is only a rough conversion using an average working day.",
  },
];

export default function IrregularHoursHolidayCalculatorPage() {
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
          Irregular hours &amp; zero-hours holiday calculator
        </h1>
        <p className="text-base leading-relaxed text-gray-600">
          Work out holiday entitlement for irregular-hours, zero-hours and
          part-year workers using the UK statutory <strong>12.07%</strong>{" "}
          accrual method introduced for leave years from 1 April 2024.
        </p>
      </header>

      <IrregularHoursCalculator />

      <section className="prose prose-gray max-w-none prose-a:text-brand-600">
        <h2>How the 12.07% method works</h2>
        <p>
          A full-time worker gets 5.6 weeks of statutory holiday a year. For
          someone whose hours vary, you can&apos;t express that as a fixed number
          of days, so the law uses a percentage instead. Over a year there are 52
          weeks, of which 5.6 are holiday, leaving 46.4 weeks actually worked.
          Holiday therefore accrues at <strong>5.6 ÷ 46.4 = 12.07%</strong> of the
          hours worked each pay period.
        </p>
        <p>
          This applies to <strong>irregular-hours workers</strong> (those whose
          paid hours are wholly or mostly variable) and{" "}
          <strong>part-year workers</strong> (those who work only part of the
          year but stay under contract, such as some term-time staff) for leave
          years starting on or after 1 April 2024.
        </p>

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
            <Link href="/guides/part-time-holiday-entitlement-uk">
              Part-time holiday entitlement explained
            </Link>
          </li>
          <li>
            <Link href="/guides/holiday-pay-overtime-uk">
              Holiday pay and overtime
            </Link>
          </li>
          <li>
            <Link href="/guides/uk-bank-holidays-by-region">
              UK bank holidays by region
            </Link>
          </li>
        </ul>
      </section>

      <aside className="rounded-lg border border-brand-100 bg-brand-50 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Stop calculating this by hand
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">
          Coverboard tracks holiday for zero-hours and irregular-hours staff
          automatically — accruing at 12.07% from the hours you log, using the
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

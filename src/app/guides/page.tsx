import type { Metadata } from "next";
import Link from "next/link";
import { getAllGuides } from "@/lib/guides";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "UK Leave & HR Guides",
  description:
    "Plain-English guides to UK statutory leave, holiday pay, bank holidays and GDPR for small employers — from the team behind Coverboard.",
  alternates: { canonical: "/guides" },
};

export default async function GuidesIndexPage() {
  const guides = await getAllGuides();

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-gray-900">UK leave &amp; HR guides</h1>
        <p className="text-base leading-relaxed text-gray-600">
          Practical, plain-English answers to the UK leave and HR questions small
          employers actually ask — statutory entitlements, holiday pay, bank holidays
          and data protection. Free to read, no sign-up required.
        </p>
      </header>

      <ul className="space-y-4">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={`/guides/${guide.slug}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
            >
              <h2 className="text-lg font-semibold text-gray-900">{guide.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                {guide.description}
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-brand-600">
                Read guide &rarr;
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="border-t border-gray-200 pt-6 text-xs text-gray-500">
        These guides are general information, not legal advice. For decisions about a
        specific employee or your obligations, consult an employment law professional.
      </p>
    </div>
  );
}

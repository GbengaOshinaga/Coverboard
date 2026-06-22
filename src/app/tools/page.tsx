import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "@/lib/tools";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Free UK HR & Leave Tools",
  description:
    "Free calculators for UK leave and holiday — including the 12.07% irregular-hours and zero-hours holiday calculator. No sign-up required.",
  alternates: { canonical: "/tools" },
};

export default function ToolsIndexPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-gray-900">Free UK HR &amp; leave tools</h1>
        <p className="text-base leading-relaxed text-gray-600">
          Free, no-sign-up calculators for the UK leave and holiday questions that
          are easy to get wrong — built on the same rules Coverboard uses in the
          product.
        </p>
      </header>

      <ul className="space-y-4">
        {TOOLS.map((tool) => (
          <li key={tool.slug}>
            <Link
              href={`/tools/${tool.slug}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
            >
              <h2 className="text-lg font-semibold text-gray-900">{tool.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                {tool.description}
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-brand-600">
                Open tool &rarr;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

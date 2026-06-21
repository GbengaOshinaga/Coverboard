import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAllGuides, getGuide, getGuideSlugs } from "@/lib/guides";
import { getAppBaseUrl } from "@/lib/app-url";

export const dynamic = "force-static";
// Every guide is known at build time; reject unknown slugs with a 404 instead of
// attempting a runtime render (the markdown lives in /marketing, which isn't
// traced into the serverless bundle).
export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await getGuideSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) return {};

  const canonical = `/guides/${slug}`;
  return {
    title: guide.title,
    description: guide.description,
    keywords: guide.keywords,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: guide.title,
      description: guide.description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
    },
  };
}

// The markdown files open with their own `# Title` heading; we render the title
// from frontmatter as the single page H1, so strip the leading H1 from the body
// to avoid a duplicate (bad for accessibility and SEO).
function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+.*(\r?\n)+/, "");
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) notFound();

  const body = stripLeadingH1(guide.content);
  const url = `${getAppBaseUrl()}/guides/${slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    keywords: guide.keywords?.join(", "),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "Coverboard" },
    publisher: { "@type": "Organization", name: "Coverboard" },
  };

  return (
    <article className="space-y-6">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-sm">
        <Link href="/guides" className="text-brand-600 hover:underline">
          &larr; All guides
        </Link>
      </nav>

      <header className="space-y-3 border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold leading-tight text-gray-900">
          {guide.title}
        </h1>
        <p className="text-base leading-relaxed text-gray-600">{guide.description}</p>
      </header>

      <div className="prose prose-gray max-w-none prose-headings:scroll-mt-24 prose-a:text-brand-600 prose-th:text-left">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>

      <aside className="mt-10 rounded-lg border border-brand-100 bg-brand-50 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Manage UK leave the easy way
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">
          Coverboard handles statutory leave, holiday pay and bank holidays for UK
          teams automatically — so the calculations in this guide just happen.
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

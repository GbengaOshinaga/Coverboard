import "server-only";
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";

/**
 * Evergreen SEO "guides" sourced from the repo's /marketing markdown files.
 *
 * Content lives in `marketing/*.md` (see marketing/README.md) and is read at
 * build time — every guide page is statically generated, so the filesystem is
 * only touched during `next build`, never at runtime.
 */

const GUIDES_DIR = path.join(process.cwd(), "marketing");

// Curated display order for the index. Any guide not listed here falls to the
// end, sorted alphabetically by slug.
const SLUG_ORDER = [
  "uk-statutory-leave-types",
  "part-time-holiday-entitlement-uk",
  "holiday-pay-overtime-uk",
  "uk-bank-holidays-by-region",
  "gdpr-sickness-records-uk",
];

export type GuideFrontmatter = {
  title: string;
  description: string;
  keywords?: string[];
};

export type GuideMeta = GuideFrontmatter & { slug: string };
export type Guide = GuideMeta & { content: string };

function orderIndex(slug: string): number {
  const i = SLUG_ORDER.indexOf(slug);
  return i === -1 ? SLUG_ORDER.length : i;
}

async function readGuideFile(slug: string): Promise<Guide | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(GUIDES_DIR, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  if (!data.title || !data.description) return null;
  return {
    slug,
    title: String(data.title),
    description: String(data.description),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : undefined,
    content,
  };
}

export async function getGuideSlugs(): Promise<string[]> {
  const entries = await fs.readdir(GUIDES_DIR);
  return entries
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .map((f) => f.replace(/\.md$/, ""));
}

export async function getGuide(slug: string): Promise<Guide | null> {
  return readGuideFile(slug);
}

export async function getAllGuides(): Promise<GuideMeta[]> {
  const slugs = await getGuideSlugs();
  const guides = (await Promise.all(slugs.map(readGuideFile))).filter(
    (g): g is Guide => g !== null,
  );
  return guides
    .sort((a, b) => orderIndex(a.slug) - orderIndex(b.slug) || a.slug.localeCompare(b.slug))
    .map(({ content: _content, ...meta }) => meta);
}

import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/app-url";
import { getGuideSlugs } from "@/lib/guides";

/**
 * Served at /sitemap.xml. Lists the public marketing/legal pages and the
 * evergreen /guides — submit it once in Google Search Console to get them
 * indexed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppBaseUrl();
  const guideSlugs = await getGuideSlugs();
  return [
    {
      url: base,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/guides`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...guideSlugs.map((slug) => ({
      url: `${base}/guides/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: `${base}/signup`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/login`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/terms`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

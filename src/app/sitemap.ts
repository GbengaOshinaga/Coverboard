import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/app-url";

/**
 * Served at /sitemap.xml. Lists only the public marketing/legal pages —
 * submit it once in Google Search Console to get the landing page indexed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppBaseUrl();
  return [
    {
      url: base,
      changeFrequency: "weekly",
      priority: 1,
    },
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

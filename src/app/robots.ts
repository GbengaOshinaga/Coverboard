import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/app-url";

/**
 * Served at /robots.txt. Only the marketing/legal pages are worth crawling;
 * everything behind auth just redirects to /login, and token-bearing URLs
 * (/verify-email, /reset-password) must never end up in a search index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/audit",
        "/calendar",
        "/help",
        "/reports",
        "/requests",
        "/settings",
        "/team",
        "/onboarding",
        "/account/",
        "/locked",
        "/verify-email",
        "/reset-password",
        "/forgot-password",
      ],
    },
    sitemap: `${getAppBaseUrl()}/sitemap.xml`,
  };
}

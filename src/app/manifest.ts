import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. Makes Coverboard installable ("Add to Home
 * Screen") and gives it standalone, app-like chrome once installed.
 *
 * start_url is "/" so the existing routing decides where to land (dashboard,
 * onboarding, /welcome, or login) based on the user's state.
 *
 * Icons reference the existing 512×512 logo. A dedicated maskable icon (with
 * safe-zone padding) and a true 192×192 are worth generating later for crisper
 * Android home-screen rendering — declared "any" here to avoid mask cropping.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coverboard — Team Leave Management",
    short_name: "Coverboard",
    description:
      "Know who's out and plan who's covered. Leave management for teams that work across countries.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}

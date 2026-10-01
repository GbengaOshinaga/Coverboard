import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { CookieBanner } from "@/components/cookie-banner";
import { PwaRegister } from "@/components/pwa-register";
import { getAppBaseUrl } from "@/lib/app-url";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Coverboard — Staff Cover for Shift-Based Teams",
    template: "%s | Coverboard",
  },
  description:
    "Know who's off, where you're short and who can cover. Leave, sickness and minimum staffing for UK shift-based teams, with statutory rules built in.",
  metadataBase: new URL(getAppBaseUrl()),
  openGraph: {
    title: "Coverboard — Staff Cover for Shift-Based Teams",
    description:
      "Know who's off, where you're short and who can cover. Leave, sickness and minimum staffing for UK shift-based teams, with statutory rules built in.",
    siteName: "Coverboard",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Coverboard — Staff Cover for Shift-Based Teams",
    description:
      "Know who's off, where you're short and who can cover.",
  },
  icons: {
    icon: "/logo.svg",
    apple: "/logo.png",
  },
  appleWebApp: {
    capable: true,
    title: "Coverboard",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
        <CookieBanner />
        <PwaRegister />
      </body>
    </html>
  );
}

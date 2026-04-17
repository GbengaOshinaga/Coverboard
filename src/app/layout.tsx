import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Coverboard — Team Leave Management",
    template: "%s | Coverboard",
  },
  description:
    "See who's out, plan coverage, and manage team leave in one place. Built for small, distributed teams with country-specific leave policies — including full UK statutory compliance.",
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Coverboard — Team Leave Management",
    description:
      "See who's out, plan coverage, and manage team leave in one place. Built for distributed teams across the UK, Africa, LATAM, and beyond.",
    siteName: "Coverboard",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Coverboard — Team Leave Management",
    description:
      "See who's out, plan coverage, and manage team leave in one place.",
  },
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
      </body>
    </html>
  );
}

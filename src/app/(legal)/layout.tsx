import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-900 hover:text-gray-700"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              CB
            </div>
            <span className="font-semibold">Coverboard</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-gray-600">
            <Link href="/terms" className="hover:text-gray-900">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy
            </Link>
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 font-medium text-brand-600 hover:bg-brand-50"
            >
              Log in
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-6 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Coverboard. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

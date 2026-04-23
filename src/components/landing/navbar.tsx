"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <nav className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
            CB
          </div>
          <span className="font-semibold text-gray-900 text-lg">Coverboard</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
          <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
          <a href="#scale-pro" className="hover:text-gray-900 transition-colors">Scale &amp; Pro</a>
          <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg transition-colors"
          >
            Get started free
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-gray-600"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-6 py-4 space-y-3">
          <a href="#features" onClick={() => setMobileOpen(false)} className="block text-sm text-gray-600 py-2">Features</a>
          <a href="#scale-pro" onClick={() => setMobileOpen(false)} className="block text-sm text-gray-600 py-2">Scale &amp; Pro</a>
          <a href="#how-it-works" onClick={() => setMobileOpen(false)} className="block text-sm text-gray-600 py-2">How it works</a>
          <a href="#pricing" onClick={() => setMobileOpen(false)} className="block text-sm text-gray-600 py-2">Pricing</a>
          <div className="flex flex-col gap-2 pt-2">
            <Link href="/login" className="text-sm font-medium text-gray-700 text-center py-2">Log in</Link>
            <Link href="/signup" className="text-sm font-medium text-white bg-brand-600 text-center py-2 rounded-lg">Get started free</Link>
          </div>
        </div>
      )}
    </header>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const COOKIE_NAME = "cb_cookie_consent_v1";
const COOKIE_MAX_AGE_DAYS = 365;

function readConsentCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

function writeConsentCookie(value: string): void {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

/**
 * PECR-compliant cookie notice. Today Coverboard only sets strictly-necessary
 * cookies (the NextAuth session + CSRF token), which don't require consent —
 * so this banner is informational. It records the user's acknowledgement so
 * we don't ask repeatedly, and is in place for when analytics or marketing
 * cookies are introduced (at which point this will become a real consent
 * gate, not an FYI).
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!readConsentCookie()) {
      setVisible(true);
    }
  }, []);

  function dismiss(value: "acknowledged" | "dismissed") {
    writeConsentCookie(value);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="text-sm text-gray-700">
        <p className="font-medium text-gray-900">We use essential cookies</p>
        <p className="mt-1 leading-relaxed">
          Coverboard uses a small number of strictly-necessary cookies to keep
          you signed in and protect form submissions. We do not use tracking or
          advertising cookies. If that ever changes we will ask you first.{" "}
          <Link
            href="/privacy#cookies"
            className="font-medium text-brand-600 hover:underline"
          >
            Read more
          </Link>
          .
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => dismiss("acknowledged")}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Got it
        </button>
        <button
          type="button"
          onClick={() => dismiss("dismissed")}
          aria-label="Dismiss"
          className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

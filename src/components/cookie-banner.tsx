"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  readConsent,
  writeConsent,
  type ConsentValue,
} from "@/lib/consent";

/**
 * Cookie consent banner. Coverboard sets strictly-necessary cookies by
 * default (NextAuth session, CSRF token). Optional analytics cookies (set
 * by PostHog) only fire after the user clicks "Accept all"; choosing
 * "Essential only" suppresses them. The choice is stored in a 1-year
 * first-party cookie so we don't ask repeatedly.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!readConsent()) setVisible(true);
  }, []);

  // The banner floats over the page, so reserve its height at the bottom of
  // the page while it's showing — otherwise it hides the end of short pages
  // (the signup form's button) and nothing can scroll out from under it.
  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    const body = document.body;
    const previous = body.style.paddingBottom;
    const update = () => {
      body.style.paddingBottom = `${el.offsetHeight + 24}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      body.style.paddingBottom = previous;
    };
  }, [visible]);

  function decide(value: ConsentValue) {
    writeConsent(value);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="text-sm text-gray-700">
        <p className="font-medium text-gray-900">We use cookies</p>
        <p className="mt-1 leading-relaxed">
          Essential cookies keep you signed in. With your permission we&rsquo;d
          also use analytics cookies to see which features get used. No
          advertising cookies.{" "}
          <Link
            href="/privacy#cookies"
            className="font-medium text-brand-600 hover:underline"
          >
            Read more
          </Link>
          .
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => decide("rejected")}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}

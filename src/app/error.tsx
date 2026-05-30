"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";

/**
 * Route-level error boundary. Catches errors thrown by pages and components
 * rendered inside the root layout. `global-error.tsx` only fires for errors
 * in the root layout itself (provider failures, font load, etc.), so this
 * boundary is what actually catches the everyday "a leave-request query
 * threw" case — the layout still renders, so we can use Tailwind + UI here.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          We&apos;ve been notified and are looking into it. You can try the
          action again — if the problem persists, contact{" "}
          <a
            href="mailto:support@coverboard.io"
            className="font-medium text-brand-600 hover:underline"
          >
            support@coverboard.io
          </a>
          .
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-gray-400">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

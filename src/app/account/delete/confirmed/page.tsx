"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

const FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function DeletionConfirmedPage() {
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);

  useEffect(() => {
    const iso = sessionStorage.getItem("deletion-scheduled-for");
    if (iso) {
      try {
        setScheduledFor(FMT.format(new Date(iso)));
      } catch {
        setScheduledFor(null);
      }
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-sm border border-gray-200">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <h1 className="text-center text-2xl font-semibold text-gray-900">
          Deletion scheduled
        </h1>
        <p className="mt-3 text-center text-sm text-gray-600">
          Your Coverboard account is scheduled for permanent deletion
          {scheduledFor ? (
            <>
              {" "}
              on <strong>{scheduledFor}</strong>.
            </>
          ) : (
            " in 30 days."
          )}
        </p>
        <div className="mt-6 space-y-2 rounded-md bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">Changed your mind?</p>
          <p>
            Sign back in and go to <strong>Settings → Billing</strong> to cancel
            the deletion and reactivate your account. After the scheduled date
            this option will no longer be available.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Sign back in to cancel
          </Link>
          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-md border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to home
          </Link>
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">
          Questions? Email{" "}
          <a
            href="mailto:hello@coverboard.app"
            className="text-brand-600 hover:underline"
          >
            hello@coverboard.app
          </a>
        </p>
      </div>
    </div>
  );
}

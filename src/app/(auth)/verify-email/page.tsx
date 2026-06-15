"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
          <div className="text-sm text-gray-500">Loading…</div>
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}

type Status = "verifying" | "success" | "already" | "error";

function VerifyInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("verifying");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setStatus("error");
      setErrorMessage("Verification link is missing a token.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          alreadyVerified?: boolean;
          error?: string;
        };
        if (res.ok && data.success) {
          setStatus(data.alreadyVerified ? "already" : "success");
        } else {
          setStatus("error");
          setErrorMessage(
            data.error ?? "We couldn't verify this email. Please try again."
          );
        }
      } catch {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            {status === "verifying" && (
              <>
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-600" />
                <h1 className="text-lg font-semibold text-gray-900">
                  Verifying your email…
                </h1>
                <p className="text-sm text-gray-500">
                  Just a moment while we confirm the link.
                </p>
              </>
            )}
            {(status === "success" || status === "already") && (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
                <h1 className="text-lg font-semibold text-gray-900">
                  Email verified
                </h1>
                <p className="text-sm text-gray-500">
                  {status === "already"
                    ? "This email was already verified. You're all set."
                    : "Thanks — your email is confirmed."}
                </p>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Continue to dashboard
                </Link>
              </>
            )}
            {status === "error" && (
              <>
                <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
                <h1 className="text-lg font-semibold text-gray-900">
                  We couldn&rsquo;t verify this link
                </h1>
                <p className="text-sm text-gray-600">{errorMessage}</p>
                <p className="text-xs text-gray-500">
                  If the link expired, sign in and click &ldquo;Resend
                  verification email&rdquo; from the banner at the top of the
                  dashboard.
                </p>
                <div className="flex justify-center gap-2">
                  <Link
                    href="/login"
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/"
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Go home
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

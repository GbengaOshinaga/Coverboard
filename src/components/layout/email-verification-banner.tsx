"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Banner shown at the top of the dashboard when the signed-in user's email
 * hasn't been verified yet. Signing in isn't blocked, so a trial starts
 * straight away, but inviting people is (inviteVerificationGate in
 * email-verification.ts), so the banner says so.
 */
export function EmailVerificationBanner({
  emailVerified,
  email,
}: {
  emailVerified: Date | string | null;
  email: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (emailVerified) return null;

  async function resend() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      if (res.ok) {
        toast("Verification email sent — check your inbox.", "success");
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast(data.error ?? "Could not send verification email", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1.5">
        <MailCheck className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Verify your email to invite people. We sent a link to{" "}
          <strong>{email}</strong>.
        </span>
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Resend verification email"}
        </button>
      </div>
    </div>
  );
}

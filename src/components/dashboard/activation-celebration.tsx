"use client";

import { useEffect, useState } from "react";
import { PartyPopper, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const SEEN_KEY = "cb_activation_seen";
const CELEBRATED_KEY = "cb_activation_celebrated";

/**
 * One-time "you're all set" celebration, shown on the dashboard once the
 * activation loop is complete. Gated so it only appears to admins who actually
 * went through the (incomplete) checklist — not to orgs that were already
 * activated when this shipped — and only once.
 */
export function ActivationCelebration() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const sawChecklist = localStorage.getItem(SEEN_KEY) === "1";
      const alreadyCelebrated = localStorage.getItem(CELEBRATED_KEY) === "1";
      if (sawChecklist && !alreadyCelebrated) {
        localStorage.setItem(CELEBRATED_KEY, "1");
        setShow(true);
      }
    } catch {
      // localStorage unavailable — skip the celebration rather than risk a loop.
    }
  }, []);

  if (!show) return null;

  return (
    <Card className="border-brand-200 bg-brand-50/60">
      <CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="flex items-start gap-3">
          <PartyPopper
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
            aria-hidden
          />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              You&apos;re all set 🎉
            </p>
            <p className="text-sm text-gray-600">
              Your team&apos;s in, a request has been made and approved —
              Coverboard is doing the work now. Nicely done.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShow(false)}
          aria-label="Dismiss"
          className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}

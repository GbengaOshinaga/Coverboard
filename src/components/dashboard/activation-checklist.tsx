"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const DISMISS_KEY = "cb_activation_dismissed_v1";

type Props = {
  /** Has invited at least one teammate (org has more than just the admin). */
  team: boolean;
  /** At least one leave request exists. */
  request: boolean;
  /** At least one request has been approved. */
  approve: boolean;
};

/**
 * First-run activation checklist shown to admins until they've completed the
 * core loop. Completion is derived from real state by the dashboard page (so it
 * can't desync and the whole card vanishes once activated); this component only
 * handles display + local dismissal.
 */
export function ActivationChecklist({ team, request, approve }: Props) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      // localStorage unavailable (private mode etc.) — just show the card.
    }
  }, []);

  // Render nothing until mounted so SSR and first client render match.
  if (!mounted || dismissed) return null;

  const steps = [
    {
      done: team,
      title: "Invite your team",
      description: "Add teammates so everyone can request leave.",
      href: "/team",
      cta: "Invite team",
    },
    {
      done: request,
      title: "Submit your first leave request",
      description: "Request time off yourself to see how it works.",
      href: "/requests/new",
      cta: "Request leave",
    },
    {
      done: approve,
      title: "Approve a request",
      description: "Approve it — balances and the calendar update instantly.",
      href: "/requests",
      cta: "Review requests",
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const firstTodo = steps.find((s) => !s.done);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <Card className="border-brand-200 bg-brand-50/40">
      <CardContent className="py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Get set up</h2>
            <p className="text-sm text-gray-500">
              {completed} of {steps.length} done — finish these to see Coverboard
              in action.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss checklist"
            className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="mt-4 space-y-3">
          {steps.map((s) => {
            const isNext = !s.done && firstTodo?.title === s.title;
            return (
              <li key={s.title} className="flex items-start gap-3">
                {s.done ? (
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
                    aria-hidden
                  />
                ) : (
                  <Circle
                    className="mt-0.5 h-5 w-5 shrink-0 text-gray-300"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      s.done ? "text-gray-400 line-through" : "text-gray-900"
                    }`}
                  >
                    {s.title}
                  </p>
                  {!s.done && (
                    <p className="text-sm text-gray-500">{s.description}</p>
                  )}
                </div>
                {!s.done &&
                  (isNext ? (
                    <Link
                      href={s.href}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      {s.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link
                      href={s.href}
                      className="shrink-0 self-center text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      {s.cta}
                    </Link>
                  ))}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TRIAL_DAYS } from "@/lib/plans";

/**
 * Where a page sells statutory pay (SSP, SMP and the rest, holiday pay, the
 * payroll report), the button starts a Growth trial, not Free: sick pay is on
 * Starter and the rest on Growth and above (planFeatures.ts), and "Start
 * free" would land someone who came for them on a plan without them. Defined
 * once for the homepage, the calculators and the guides.
 */
export const STATUTORY_PAY_TRIAL_HREF = "/signup?plan=growth";
export const STATUTORY_PAY_PLAN_NOTE = "Sick pay from Starter, the rest from Growth";

export function StatutoryPayTrialButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href={STATUTORY_PAY_TRIAL_HREF}
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 ${className}`}
    >
      Try it free for {TRIAL_DAYS} days <ArrowRight size={14} aria-hidden />
    </Link>
  );
}

/** The note under the button: what the trial includes and what Free doesn't. */
export function StatutoryPayTrialNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-gray-600 ${className}`}>
      Everything&apos;s included during the trial, and no card is required. Sick pay is on Starter and above, and
      the other statutory pay, holiday pay and the payroll report on Growth and above. The free plan covers
      leave, cover and the calendar for up to 5 people.
    </p>
  );
}

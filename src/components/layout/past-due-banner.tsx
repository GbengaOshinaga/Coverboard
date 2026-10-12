import Link from "next/link";

/**
 * For admins while Stripe retries a failed payment (past_due), including a
 * trial whose first charge failed. The trial banner stops once the trial
 * ends, so without this nothing on screen says the plan is at risk.
 */
export function PastDueBanner({ subscriptionStatus, isAdmin }: { subscriptionStatus: string | null; isAdmin: boolean }) {
  if (!isAdmin || subscriptionStatus !== "past_due") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
      <span>Your last payment didn&apos;t go through. Stripe will try again; update your card to keep your plan.</span>
      <Link
        href="/settings/billing/add-payment?update=1"
        className="font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
      >
        Update payment details →
      </Link>
    </div>
  );
}

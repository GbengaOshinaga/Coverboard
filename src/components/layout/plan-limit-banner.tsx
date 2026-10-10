import Link from "next/link";

/**
 * For admins: the team is bigger than its plan, or than the plan its trial
 * moves to (planLimitWarning). Once a paid plan is outgrown, admins are held
 * at Billing until it fits; this says why.
 */
export function PlanLimitBanner({ warning }: { warning: string | null }) {
  if (!warning) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>{warning}</span>
      <Link href="/settings/billing" className="font-medium text-amber-800 underline underline-offset-2 hover:text-amber-950">
        Choose a plan →
      </Link>
    </div>
  );
}

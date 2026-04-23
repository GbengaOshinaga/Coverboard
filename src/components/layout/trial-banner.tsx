import Link from "next/link";
import { computeTrialState } from "@/lib/trial";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function TrialBanner({
  trialEndsAt,
  subscriptionStatus,
  cardAdded,
  isAdmin,
}: {
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
  cardAdded: boolean;
  isAdmin: boolean;
}) {
  if (!isAdmin) return null;
  if (subscriptionStatus !== "trialing") return null;
  if (cardAdded) return null;

  const state = computeTrialState(trialEndsAt);
  if (!state) return null;

  const { daysLeft, tone, endsAt } = state;

  let bg = "bg-blue-50 border-blue-200 text-blue-900";
  let linkCls = "text-blue-700 hover:text-blue-900";
  let label: string;

  if (tone === "danger" && daysLeft <= 0) {
    bg = "bg-red-50 border-red-200 text-red-900";
    linkCls = "text-red-700 hover:text-red-900";
    label = "Your trial has ended. Add your card now to continue using Coverboard.";
  } else if (tone === "danger") {
    bg = "bg-red-50 border-red-200 text-red-900";
    linkCls = "text-red-700 hover:text-red-900";
    label = "Your trial ends today. Add your card now to continue using Coverboard.";
  } else if (tone === "warn") {
    bg = "bg-amber-50 border-amber-200 text-amber-900";
    linkCls = "text-amber-800 hover:text-amber-950";
    label = `Your trial ends in ${daysLeft} ${
      daysLeft === 1 ? "day" : "days"
    }. Add your card now to avoid losing access.`;
  } else {
    label = `${daysLeft} days left in your free trial. Add your card now to keep access after ${DATE_FMT.format(endsAt)}.`;
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${bg}`}
    >
      <span>{label}</span>
      <Link
        href="/settings/billing/add-payment"
        className={`font-medium underline underline-offset-2 ${linkCls}`}
      >
        Add payment details →
      </Link>
    </div>
  );
}

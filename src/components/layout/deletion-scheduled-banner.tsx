import Link from "next/link";
import { daysUntil } from "@/lib/deletionScheduler";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Persistent red banner shown across the dashboard when an admin has
 * scheduled the org for deletion. Members see a softer copy; admins get a
 * direct link to Settings → Danger zone where they can cancel and keep their
 * data. Returns null when no deletion is pending.
 */
export function DeletionScheduledBanner({
  deletionScheduledFor,
  isAdmin,
}: {
  deletionScheduledFor: Date | null;
  isAdmin: boolean;
}) {
  if (!deletionScheduledFor) return null;

  const daysLeft = daysUntil(deletionScheduledFor);
  const isImminent = typeof daysLeft === "number" && daysLeft <= 7;

  const bg = isImminent
    ? "bg-red-50 border-red-200 text-red-900"
    : "bg-red-50/70 border-red-200 text-red-900";
  const linkCls = "text-red-800 hover:text-red-950";

  const dateLabel = DATE_FMT.format(deletionScheduledFor);
  const daysLabel =
    typeof daysLeft === "number"
      ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`
      : null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${bg}`}
    >
      <span>
        {isAdmin ? (
          <>
            Your organisation is scheduled for permanent deletion on{" "}
            <strong>{dateLabel}</strong>
            {daysLabel ? ` (${daysLabel})` : ""}. All team data will be
            irrecoverably removed.
          </>
        ) : (
          <>
            This organisation is scheduled for closure on{" "}
            <strong>{dateLabel}</strong>. Contact your administrator if this is
            unexpected.
          </>
        )}
      </span>
      {isAdmin && (
        <Link
          href="/settings#danger-zone"
          className={`font-medium underline underline-offset-2 ${linkCls}`}
        >
          Cancel deletion →
        </Link>
      )}
    </div>
  );
}

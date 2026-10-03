import Link from "next/link";
import { Hand } from "lucide-react";
import { listCoverOffersFor } from "@/lib/cover-offers";

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "You've been asked to cover" — only when something is waiting on them. */
export async function MyCoverRequests({ userId, organizationId }: { userId: string; organizationId: string }) {
  const pending = (await listCoverOffersFor(userId, organizationId)).filter((o) => o.status === "PENDING");
  if (pending.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 font-semibold text-amber-900">
        <Hand className="h-4 w-4" />
        You&apos;ve been asked to cover {pending.length === 1 ? "a shift" : `${pending.length} shifts`}
      </p>
      <ul className="mt-1 text-sm text-amber-900">
        {pending.slice(0, 3).map((o) => (
          <li key={o.id}>
            {o.shiftName} · {DAY.format(new Date(`${o.date}T00:00:00Z`))} · {o.startTime}–{o.endTime}
          </li>
        ))}
      </ul>
      <Link href="/cover-requests" className="mt-2 inline-block text-sm font-semibold text-amber-900 underline hover:no-underline">
        Accept or decline
      </Link>
    </div>
  );
}

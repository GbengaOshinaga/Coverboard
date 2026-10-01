import type { CoverCandidate, RuledOutMember } from "@/lib/shiftCover";

const CONTRACT_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  VARIABLE_HOURS: "Variable hours",
  ZERO_HOURS: "Zero-hours",
};

const MAX_RULED_OUT = 3;

/** Scheduled (from their working pattern) in the week of the short shift. */
function weekHoursLabel(hours: number): string {
  if (hours === 0) return "No shifts this week";
  return `${hours}h this week`;
}

/**
 * Who could cover a short shift, and who can't and why. Candidates follow the
 * engine's rules (not on the shift, not on leave, 11h rest); nothing here
 * contacts anyone.
 */
export function CoverOptions({
  candidates,
  ruledOut,
}: {
  candidates: CoverCandidate[];
  ruledOut: RuledOutMember[];
}) {
  if (candidates.length === 0 && ruledOut.length === 0) return null;
  const hidden = ruledOut.length - MAX_RULED_OUT;

  return (
    <div className="mt-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-gray-900">
      <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {candidates.length > 0 ? "Could cover" : "No one free to cover"}
      </p>
      <ul className="divide-y divide-gray-100">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-xs text-gray-500">
                {[
                  c.employmentType ? CONTRACT_LABELS[c.employmentType] : null,
                  weekHoursLabel(c.weekHours),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
              Free
            </span>
          </li>
        ))}
        {ruledOut.slice(0, MAX_RULED_OUT).map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <p className="text-sm text-gray-400 line-through">{o.name}</p>
              {o.note && <p className="truncate text-xs text-gray-500">{o.note}</p>}
            </div>
            <span className="shrink-0 rounded bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
              {o.reason === "rest" ? "Needs 11h rest" : "On leave"}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="pb-1 text-xs text-gray-500">
          …and {hidden} more who can&apos;t cover.
        </p>
      )}
    </div>
  );
}

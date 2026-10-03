"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, MapPin } from "lucide-react";
import type { CoverCandidate, CoverOfferSummary, RuledOutMember } from "@/lib/shiftCover";
import { CoverOptions } from "./cover-options";

type ShiftCover = {
  shiftId: string;
  name: string;
  available: number;
  required: number;
  coverRequired: boolean;
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  coverCandidates: CoverCandidate[];
  ruledOut?: RuledOutMember[];
  offers?: CoverOfferSummary[];
  staffAvailable?: Array<{ id: string; name: string }>;
};

type DailyCover = {
  date: string;
  available: number;
  required: number;
  isWeekend: boolean;
  isBankHoliday: boolean;
  coverRequired: boolean;
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  staffAvailable: Array<{ id: string; name: string }>;
  shifts: ShiftCover[];
};

type CoverCheckResult = {
  hasConflict: boolean;
  conflicts: Array<{
    date: string;
    available: number;
    required: number;
    shortfall: number;
    staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
  }>;
  regionId: string | null;
  regionName: string | null;
  minCover: number | null;
  usesShifts: boolean;
  requesterScheduled: boolean;
};

const FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return FMT.format(new Date(y, m - 1, d));
}

function CoverRow({
  label,
  available,
  required,
  staffOff,
  coverCandidates = [],
  ruledOut = [],
  offers = [],
  shiftId,
  date,
  leaveRequestId,
  coveredBy = [],
}: {
  label: string;
  available: number;
  required: number;
  staffOff: Array<{ id: string; name: string }>;
  coverCandidates?: CoverCandidate[];
  ruledOut?: RuledOutMember[];
  offers?: CoverOfferSummary[];
  shiftId?: string;
  date?: string;
  leaveRequestId?: string;
  /** People on this shift because they accepted a cover request. */
  coveredBy?: string[];
}) {
  const ok = available >= required;
  return (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-gray-700">{label}</p>
        {staffOff.length > 0 && (
          <p className="mt-0.5 text-[11px] text-gray-500">
            Off: {staffOff.map((s) => s.name).join(", ")}
          </p>
        )}
        {coveredBy.length > 0 && (
          <p className="mt-0.5 text-[11px] text-emerald-700">
            Covered by {coveredBy.join(", ")}
          </p>
        )}
        {!ok && (
          <CoverOptions
            candidates={coverCandidates}
            ruledOut={ruledOut}
            offers={offers}
            shiftId={shiftId}
            date={date}
            leaveRequestId={leaveRequestId}
          />
        )}
      </div>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
          ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
        }`}
      >
        {available}/{required}
      </span>
    </li>
  );
}

export function RegionalCoverPanel({
  leaveRequestId,
  startDate,
  endDate,
  coverOverride,
}: {
  leaveRequestId: string;
  startDate: string;
  endDate: string;
  coverOverride?: boolean;
}) {
  const [check, setCheck] = useState<CoverCheckResult | null>(null);
  const [days, setDays] = useState<DailyCover[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const checkRes = await fetch(
          `/api/leave-requests/${leaveRequestId}/check-cover`,
          { method: "POST" }
        );
        if (!checkRes.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const checkData: CoverCheckResult = await checkRes.json();
        if (cancelled) return;
        setCheck(checkData);

        if (checkData.regionId) {
          const start = startDate.slice(0, 10);
          const end = endDate.slice(0, 10);
          const rangeRes = await fetch(
            `/api/regions/${checkData.regionId}/cover/range?start=${start}&end=${end}`
          );
          if (rangeRes.ok && !cancelled) {
            const rangeData = await rangeRes.json();
            setDays(rangeData.days ?? []);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [leaveRequestId, startDate, endDate]);

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Loading cover…
      </div>
    );
  }

  if (!check || !check.regionId) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
        <p className="font-medium text-gray-700">No location assigned</p>
        <p className="mt-0.5">
          This person isn&apos;t assigned to a location, so cover is not tracked for
          their absences.
        </p>
      </div>
    );
  }

  const workingDays = days.filter((d) => d.coverRequired);
  // "Cover OK" must mean the shifts really are covered — not just that this
  // absence doesn't make them worse. Someone with no working pattern never
  // "causes" a gap, so without this a 0/3 shift showed green.
  const anyShort = workingDays.some((d) =>
    d.shifts.length > 0
      ? d.shifts.some((s) => s.coverRequired && s.available < s.required)
      : d.available < d.required
  );
  const notScheduled = check.usesShifts && !check.requesterScheduled;
  const coverState: "conflict" | "already_short" | "not_scheduled" | "ok" =
    check.hasConflict
      ? "conflict"
      : anyShort
        ? "already_short"
        : notScheduled
          ? "not_scheduled"
          : "ok";

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-white px-3 py-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <MapPin className="h-3.5 w-3.5 text-gray-500" />
          {check.regionName}
          {!check.usesShifts && (
            <span className="text-xs font-normal text-gray-500">
              min cover {check.minCover}
            </span>
          )}
        </div>
        {coverState === "ok" ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <ShieldCheck className="h-3 w-3" />
            Cover OK
          </span>
        ) : coverState === "not_scheduled" ? (
          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            Not on any shift
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            <AlertTriangle className="h-3 w-3" />
            {coverState === "conflict" ? "Below minimum" : "Already short"}
          </span>
        )}
      </div>

      {coverOverride && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          Cover override applied — recorded in the audit log.
        </div>
      )}

      {notScheduled && (
        <p className="text-gray-600">
          This person has no shifts in their working pattern on these dates, so
          their absence doesn&apos;t change cover.{" "}
          <Link href="/team" className="font-medium text-brand-600 hover:underline">
            Set working patterns on the Team page
          </Link>{" "}
          so cover counts are accurate.
        </p>
      )}
      {coverState === "already_short" && (
        <p className="text-amber-800">
          These shifts are short whether or not this person is off. Often that
          means people in this location don&apos;t have working patterns yet.
        </p>
      )}

      {workingDays.length === 0 ? (
        <p className="text-gray-500">
          Cover isn&apos;t required on any day in this range.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {workingDays.flatMap((d) => {
            if (d.shifts.length > 0) {
              return d.shifts
                .filter((s) => s.coverRequired)
                .map((s) => (
                  <CoverRow
                    key={`${d.date}:${s.shiftId}`}
                    label={`${formatDay(d.date)} · ${s.name}`}
                    available={s.available}
                    required={s.required}
                    staffOff={s.staffOff}
                    coverCandidates={s.coverCandidates}
                    ruledOut={s.ruledOut}
                    offers={s.offers}
                    shiftId={s.shiftId}
                    date={d.date}
                    leaveRequestId={leaveRequestId}
                    coveredBy={(s.offers ?? [])
                      .filter((o) => o.status === "ACCEPTED")
                      .map((o) => s.staffAvailable?.find((p) => p.id === o.userId)?.name)
                      .filter((n): n is string => !!n)}
                  />
                ));
            }
            return [
              <CoverRow
                key={d.date}
                label={formatDay(d.date)}
                available={d.available}
                required={d.required}
                staffOff={d.staffOff}
              />,
            ];
          })}
        </ul>
      )}
    </div>
  );
}

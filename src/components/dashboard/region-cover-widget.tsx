import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeDailyCover } from "@/lib/regionCover";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MapPin, ShieldCheck, AlertTriangle } from "lucide-react";

type RegionCoverRow = {
  id: string;
  name: string;
  color: string | null;
  minCover: number;
  available: number;
  ok: boolean;
  staffOff: Array<{ id: string; name: string }>;
  coverNotRequired: boolean;
  /** Enforced shifts today; empty for regions without shift types. */
  shifts: Array<{
    id: string;
    name: string;
    available: number;
    required: number;
    coverCandidates: Array<{ id: string; name: string }>;
  }>;
  /** Shift locations only: active members with no current working pattern. */
  withoutPattern: number;
};

/**
 * Nudge admins to configure cover when it isn't set up yet — so the cover
 * concept leads the dashboard for everyone, not just orgs that already use it.
 */
function CoverSetupPrompt() {
  return (
    <Card className="border-brand-100 bg-brand-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          Set up cover
        </CardTitle>
        <CardDescription>
          Tell Coverboard the minimum staff each team or location needs, and we&apos;ll
          warn you before a leave request would leave you short-staffed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/settings/regions"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <MapPin className="h-4 w-4" />
          Set minimum cover
        </Link>
      </CardContent>
    </Card>
  );
}

export async function RegionCoverWidget({
  organizationId,
  today,
  isAdmin = false,
  showCoverCandidates = false,
}: {
  organizationId: string;
  today: Date;
  isAdmin?: boolean;
  /** Managers and admins only — see canSeeCoverCandidates. */
  showCoverCandidates?: boolean;
}) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { regionsEnabled: true },
  });
  if (!org?.regionsEnabled) return isAdmin ? <CoverSetupPrompt /> : null;

  const regions = await prisma.region.findMany({
    where: { organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      minCover: true,
    },
  });

  if (regions.length === 0) return isAdmin ? <CoverSetupPrompt /> : null;

  const rows: RegionCoverRow[] = await Promise.all(
    regions.map(async (r) => {
      const days = await computeDailyCover({
        organizationId,
        regionId: r.id,
        start: today,
        end: today,
      });
      const day = days[0];
      const skip = !day || !day.coverRequired;
      const shifts = (day?.shifts ?? [])
        .filter((s) => s.coverRequired)
        .map((s) => ({
          id: s.shiftId,
          name: s.name,
          available: s.available,
          required: s.required,
          coverCandidates: showCoverCandidates ? s.coverCandidates : [],
        }));
      // Shift counts come from working patterns, so anyone without one is
      // invisible to cover. New teams start that way; say so rather than
      // just showing 0/3.
      const withoutPattern =
        shifts.length > 0
          ? await prisma.user.count({
              where: {
                regionId: r.id,
                isActive: true,
                workPatterns: {
                  none: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
                },
              },
            })
          : 0;
      return {
        id: r.id,
        name: r.name,
        color: r.color,
        withoutPattern,
        minCover: day?.required ?? r.minCover,
        available: day?.available ?? 0,
        ok: skip ? true : day.available >= day.required,
        shifts,
        staffOff: day?.staffOff ?? [],
        coverNotRequired: skip,
      };
    })
  );

  const breachCount = rows.filter(
    (r) => !r.coverNotRequired && !r.ok
  ).length;
  const noCoverToday = rows.every((r) => r.coverNotRequired);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-brand-500" />
              Cover today
            </CardTitle>
            <CardDescription>
              {noCoverToday
                ? "None of your locations require cover today."
                : breachCount > 0
                ? `${breachCount} location${breachCount === 1 ? "" : "s"} below minimum cover.`
                : "All locations meeting minimum cover."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 rounded-md border border-gray-100 px-3 py-2"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color ?? "#9CA3AF" }}
                />
                <div className="min-w-0">
                  <Link
                    href={`/team`}
                    className="text-sm font-medium text-gray-900 hover:text-brand-600"
                  >
                    {r.name}
                  </Link>
                  {r.shifts.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.shifts.map((s) => (
                        <span
                          key={s.id}
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            s.available >= s.required
                              ? "bg-gray-50 text-gray-600"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {s.name} {s.available}/{s.required}
                        </span>
                      ))}
                    </div>
                  )}
                  {showCoverCandidates && r.withoutPattern > 0 && (
                    <p className="mt-0.5 text-xs text-amber-800">
                      {r.withoutPattern} {r.withoutPattern === 1 ? "person has" : "people have"} no
                      working pattern, so they don&apos;t count
                      towards shifts.{" "}
                      <Link href="/team" className="font-medium underline hover:no-underline">
                        Set patterns
                      </Link>
                    </p>
                  )}
                  {r.shifts
                    .filter((s) => s.coverCandidates.length > 0)
                    .map((s) => (
                      <p key={s.id} className="mt-0.5 text-xs text-emerald-700">
                        Could cover {s.name}:{" "}
                        {s.coverCandidates.map((m) => m.name).join(", ")}
                      </p>
                    ))}
                  {r.staffOff.length > 0 ? (
                    <p className="mt-0.5 text-xs text-gray-500">
                      Off: {r.staffOff.map((s) => s.name).join(", ")}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-gray-400">
                      No one off today
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {r.coverNotRequired ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : r.ok ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    <ShieldCheck className="h-3 w-3" />
                    {r.available}/{r.minCover}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    {r.available}/{r.minCover}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

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
  isWeekendOrHoliday: boolean;
};

export async function RegionCoverWidget({
  organizationId,
  today,
}: {
  organizationId: string;
  today: Date;
}) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { regionsEnabled: true },
  });
  if (!org?.regionsEnabled) return null;

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

  if (regions.length === 0) return null;

  const rows: RegionCoverRow[] = await Promise.all(
    regions.map(async (r) => {
      const days = await computeDailyCover({
        organizationId,
        regionId: r.id,
        start: today,
        end: today,
      });
      const day = days[0];
      const skip = !day || day.isWeekend || day.isBankHoliday;
      return {
        id: r.id,
        name: r.name,
        color: r.color,
        minCover: r.minCover,
        available: day?.available ?? 0,
        ok: skip ? true : day.available >= day.required,
        staffOff: day?.staffOff ?? [],
        isWeekendOrHoliday: skip,
      };
    })
  );

  const breachCount = rows.filter(
    (r) => !r.isWeekendOrHoliday && !r.ok
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-brand-500" />
              Regional cover today
            </CardTitle>
            <CardDescription>
              {rows[0]?.isWeekendOrHoliday
                ? "Cover requirements don't apply on weekends or bank holidays."
                : breachCount > 0
                ? `${breachCount} region${breachCount === 1 ? "" : "s"} below minimum cover.`
                : "All regions meeting minimum cover."}
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
                {r.isWeekendOrHoliday ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : r.ok ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    <ShieldCheck className="h-3 w-3" />
                    {r.available}/{r.minCover}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
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

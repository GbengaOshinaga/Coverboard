import Link from "next/link";
import { FileWarning } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hasFeatureForEnum } from "@/lib/planFeatures";
import { selectOverdueFitNotes } from "@/lib/fit-note-alerts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Sickness absences past day 7 without fit notes recorded. Same rule (and
 * plan) as the Monday fit-note alert email and the leave operations report,
 * so all three agree. Renders nothing when there's nothing to chase.
 */
export async function FitNotesDue({ organizationId }: { organizationId: string }) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });
  if (!org || !hasFeatureForEnum(org.plan, "ssp_tracking")) return null;

  const now = new Date();
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      user: { organizationId },
      status: "APPROVED",
      evidenceProvided: false,
      startDate: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
      evidenceProvided: true,
      user: { select: { id: true, name: true, email: true } },
      leaveType: { select: { name: true } },
    },
  });
  const overdue = selectOverdueFitNotes(leaves, now);
  if (overdue.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-amber-600" />
          Fit notes due
        </CardTitle>
        <CardDescription>
          Off sick for more than 7 days without a fit note recorded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-gray-100 text-sm">
          {overdue.map((o) => (
            <li key={o.leaveId} className="flex items-center justify-between gap-3 py-2">
              <span className="font-medium text-gray-900">{o.userName}</span>
              <span className="text-xs text-gray-500">
                Off since {FMT.format(o.startDate)} · day {o.daysElapsed + 1}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/requests"
          className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Record fit notes in Requests →
        </Link>
      </CardContent>
    </Card>
  );
}

import type { Metadata } from "next";
import { requireActiveSession } from "@/lib/require-active-session";
import { prisma } from "@/lib/prisma";
import { isSicknessLeaveTypeName } from "@/lib/leave-requests/rules";
import { sspAppliesTo } from "@/lib/ssp-scope";
import { OffSickForm } from "@/components/leave/off-sick-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "I'm off sick" };

/** Anyone telling the team they're off sick (managers record it for others at /requests/log-sickness). */
export default async function OffSickPage() {
  const { session } = await requireActiveSession();
  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const userId = sessionUser.id as string;

  const [leaveTypes, me] = await Promise.all([
    prisma.leaveType.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { workCountry: true } }),
  ]);
  const sicknessTypes = leaveTypes.filter((t) => isSicknessLeaveTypeName(t.name));
  // The UK statutory type when there is one, as the managers' form does.
  const sicknessType = sicknessTypes.find((t) => t.name.includes("SSP")) ?? sicknessTypes[0] ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">I&apos;m off sick</h1>
        <p className="text-sm text-gray-500">Let your team know, so they can arrange cover.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>When are you off?</CardTitle>
          <CardDescription>Recorded straight away: there&apos;s nothing to approve.</CardDescription>
        </CardHeader>
        <CardContent>
          <OffSickForm sicknessTypeId={sicknessType?.id ?? null} showFitNoteHint={sspAppliesTo(me?.workCountry ?? null)} />
        </CardContent>
      </Card>
    </div>
  );
}

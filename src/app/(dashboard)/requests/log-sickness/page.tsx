import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSicknessLeaveTypeName } from "@/lib/leave-requests/rules";
import { LogSicknessForm } from "@/components/leave/log-sickness-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "Log sickness" };

export default async function LogSicknessPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const sessionUser = session.user as Record<string, unknown>;
  const role = sessionUser.role as string;
  if (role !== "ADMIN" && role !== "MANAGER") redirect("/requests/new");
  const orgId = sessionUser.organizationId as string;
  const myId = sessionUser.id as string;

  const [members, leaveTypes] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId, isActive: true, id: { not: myId } },
      select: { id: true, name: true, region: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.leaveType.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Log sickness</h1>
        <p className="text-sm text-gray-500">
          Someone called in sick? Record it here and see where you&apos;re short.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Absence details</CardTitle>
          <CardDescription>
            Recorded straight away, no approval needed. They&apos;ll see it in
            their own time off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogSicknessForm
            members={members.map((m) => ({
              id: m.id,
              name: m.name,
              regionName: m.region?.name ?? null,
            }))}
            sicknessTypes={leaveTypes.filter((t) => isSicknessLeaveTypeName(t.name))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

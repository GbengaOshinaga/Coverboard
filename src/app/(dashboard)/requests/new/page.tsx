import type { Metadata } from "next";
import { requireActiveSession } from "@/lib/require-active-session";
import { prisma } from "@/lib/prisma";
import { RequestForm } from "@/components/leave/request-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "New Request" };

export default async function NewRequestPage() {
  const { session } = await requireActiveSession();
  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const currentUserId = (session.user as Record<string, unknown>).id as string;
  const role = (session.user as Record<string, unknown>).role as string;
  const canRecordForOthers = role === "ADMIN" || role === "MANAGER";

  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      color: true,
      requiresEvidence: true,
      minNoticeDays: true,
      allowanceUnit: true,
    },
    orderBy: { name: "asc" },
  });

  // Admins and managers can record leave for someone on their team.
  const teamMembers = canRecordForOthers
    ? await prisma.user.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Request time off
        </h1>
        <p className="text-sm text-gray-500">
          {canRecordForOthers
            ? "Book your own leave, or record leave already agreed with someone on your team"
            : "Submit a leave request for your manager to review"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leave details</CardTitle>
          <CardDescription>
            Select your dates and leave type. We&apos;ll automatically check
            for team overlap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequestForm
            leaveTypes={leaveTypes}
            currentUserId={currentUserId}
            teamMembers={teamMembers}
          />
        </CardContent>
      </Card>
    </div>
  );
}

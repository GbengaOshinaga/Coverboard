import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RequestForm } from "@/components/leave/request-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "New Request" };

export default async function NewRequestPage() {
  const session = await getServerSession(authOptions);
  const orgId = (session!.user as Record<string, unknown>).organizationId as string;
  const currentUserId = (session!.user as Record<string, unknown>).id as string;

  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Request time off
        </h1>
        <p className="text-sm text-gray-500">
          Submit a leave request for your manager to review
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
          <RequestForm leaveTypes={leaveTypes} currentUserId={currentUserId} />
        </CardContent>
      </Card>
    </div>
  );
}

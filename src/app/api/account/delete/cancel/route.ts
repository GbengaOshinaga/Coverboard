import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelScheduledDeletion } from "@/lib/deletionScheduler";
import { emailDeletionCanceled } from "@/lib/billing-emails";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  const { wasScheduled } = await cancelScheduledDeletion({
    organizationId: orgId,
    canceledBy: sessionUser.email as string,
  });

  if (wasScheduled) {
    const adminEmail = sessionUser.email as string | undefined;
    if (adminEmail) await emailDeletionCanceled({ to: adminEmail });
  }

  return NextResponse.json({ wasScheduled });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelScheduledDeletion } from "@/lib/deletionScheduler";
import { prisma } from "@/lib/prisma";
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
  // A locked team (trial ended without a card, subscription cancelled or
  // ended) keeps its data by paying, which cancels the deletion. Cancelling
  // it here would keep an unpaid team's data forever.
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
  if (org?.plan === "LOCKED") {
    return NextResponse.json(
      { error: "Your plan has ended. Add a payment method in Billing to keep your data; that cancels the deletion." },
      { status: 409 }
    );
  }
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

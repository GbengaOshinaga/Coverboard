import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { scheduleDeletion } from "@/lib/deletionScheduler";
import { emailDeletionScheduled } from "@/lib/billing-emails";
import { recordAudit, requestAuditContext } from "@/lib/audit";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only organization admins can delete the account" },
      { status: 403 }
    );
  }

  const orgId = sessionUser.organizationId as string;
  const body = (await request.json().catch(() => ({}))) as {
    confirmation?: string;
  };
  if (body.confirmation !== "DELETE") {
    return NextResponse.json(
      { error: "Confirmation text must be exactly 'DELETE'" },
      { status: 400 }
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      stripeSubscriptionId: true,
      deletionScheduledFor: true,
    },
  });
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (org.stripeSubscriptionId && stripe) {
    try {
      await stripe.subscriptions.cancel(org.stripeSubscriptionId);
    } catch (err) {
      console.error("Stripe cancel failed during account deletion:", err);
    }
  }

  const { scheduledFor } = await scheduleDeletion({
    organizationId: orgId,
    reason: "user_requested",
  });

  await recordAudit({
    organizationId: orgId,
    action: "data_retention.anonymised",
    resource: "organization",
    resourceId: orgId,
    actor: {
      id: sessionUser.id as string,
      email: sessionUser.email as string,
      role: sessionUser.role as string,
    },
    metadata: { scheduledFor: scheduledFor.toISOString(), reason: "user_requested" },
    context: requestAuditContext(request),
  });

  const adminEmail = (sessionUser.email as string) ?? null;
  if (adminEmail) {
    await emailDeletionScheduled({
      to: adminEmail,
      scheduledFor,
      reason: "user_requested",
    });
  }

  return NextResponse.json({ scheduledFor });
}

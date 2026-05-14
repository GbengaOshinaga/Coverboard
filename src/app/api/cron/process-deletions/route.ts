import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleDeletion } from "@/lib/deletionScheduler";
import { emailDeletionComplete } from "@/lib/billing-emails";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const STUB_NAME = "[deleted organization]";
const STUB_SLUG_PREFIX = "deleted-";

async function executeDeletion(organizationId: string): Promise<{
  organizationName: string;
  adminEmail: string | null;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, deletionReason: true, slug: true },
  });
  if (!org) throw new Error(`Organization ${organizationId} not found`);

  const admin = await prisma.user.findFirst({
    where: { organizationId: org.id, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  const adminEmail = admin?.email ?? null;

  await prisma.$transaction(
    async (tx) => {
      const userIds = (
        await tx.user.findMany({
          where: { organizationId: org.id },
          select: { id: true },
        })
      ).map((u) => u.id);

      if (userIds.length > 0) {
        await tx.leaveRequest.deleteMany({ where: { userId: { in: userIds } } });
        await tx.weeklyEarning.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userWeeklyHours.deleteMany({ where: { userId: { in: userIds } } });
        await tx.leaveCarryOverBalance.deleteMany({ where: { userId: { in: userIds } } });
        await tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
        await tx.jiraUserMapping.deleteMany({ where: { userId: { in: userIds } } });
      }

      await tx.jiraIntegration.deleteMany({ where: { organizationId: org.id } });
      await tx.bankHoliday.deleteMany({ where: { organizationId: org.id } });
      await tx.publicHoliday.deleteMany({ where: { organizationId: org.id } });
      await tx.leaveType.deleteMany({ where: { organizationId: org.id } });
      await tx.auditLog.deleteMany({ where: { organizationId: org.id } });
      await tx.user.deleteMany({ where: { organizationId: org.id } });

      await tx.organization.update({
        where: { id: org.id },
        data: {
          name: STUB_NAME,
          slug: `${STUB_SLUG_PREFIX}${org.id}`,
          onboardingCompleted: false,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripePriceId: null,
          subscriptionStatus: "deleted",
          trialEndsAt: null,
          cardAdded: false,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          trialExpiredGraceEndsAt: null,
          plan: "LOCKED",
          deletionConfirmedAt: new Date(),
        },
      });

      await tx.dataDeletionAudit.create({
        data: {
          organizationId: org.id,
          organizationName: org.name,
          adminEmail,
          event: "executed",
          reason: org.deletionReason,
          metadata: { userCount: userIds.length },
        },
      });
    },
    { timeout: 60_000 }
  );

  return { organizationName: org.name, adminEmail };
}

async function recordFailure(
  organizationId: string,
  organizationName: string,
  error: unknown
): Promise<void> {
  try {
    await prisma.dataDeletionAudit.create({
      data: {
        organizationId,
        organizationName,
        event: "failed",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    });
  } catch (auditErr) {
    console.error("Failed to record deletion failure audit:", auditErr);
  }
}

async function promoteExpiredGraceToScheduled(now: Date): Promise<number> {
  const toPromote = await prisma.organization.findMany({
    where: {
      trialExpiredGraceEndsAt: { lte: now },
      deletionScheduledFor: null,
    },
    select: { id: true },
  });

  for (const org of toPromote) {
    try {
      await scheduleDeletion({
        organizationId: org.id,
        reason: "trial_expired",
      });
    } catch (err) {
      console.error(`Failed to schedule deletion for ${org.id}:`, err);
    }
  }
  return toPromote.length;
}

export async function POST(request: Request) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) return auth.response;

  const now = new Date();
  const result = {
    promotedFromGrace: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    failures: [] as string[],
  };

  try {
    result.promotedFromGrace = await promoteExpiredGraceToScheduled(now);

    const due = await prisma.organization.findMany({
      where: {
        deletionScheduledFor: { lte: now },
        deletionConfirmedAt: null,
      },
      select: { id: true, name: true },
    });

    result.processed = due.length;

    for (const org of due) {
      try {
        const { organizationName, adminEmail } = await executeDeletion(org.id);
        result.succeeded++;
        if (adminEmail) {
          try {
            await emailDeletionComplete({
              to: adminEmail,
              organizationName,
            });
          } catch (emailErr) {
            console.error(`Deletion email failed for ${org.id}:`, emailErr);
          }
        }
      } catch (err) {
        result.failed++;
        result.failures.push(org.id);
        console.error(`Deletion failed for ${org.id}:`, err);
        await recordFailure(org.id, org.name, err);
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Deletion cron error:", error);
    return NextResponse.json(
      { error: "Internal server error", ...result },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}

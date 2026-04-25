import { prisma } from "@/lib/prisma";

export const DELETION_GRACE_DAYS = 30;

export type DeletionReason =
  | "trial_expired"
  | "subscription_canceled"
  | "user_requested"
  | "payment_failed_grace_expired";

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

async function getAdminEmail(organizationId: string): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { organizationId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return admin?.email ?? null;
}

export async function scheduleDeletion(params: {
  organizationId: string;
  reason: DeletionReason;
  requestedAt?: Date;
}): Promise<{ scheduledFor: Date }> {
  const requestedAt = params.requestedAt ?? new Date();
  const scheduledFor = addDays(requestedAt, DELETION_GRACE_DAYS);

  const org = await prisma.organization.update({
    where: { id: params.organizationId },
    data: {
      deletionRequestedAt: requestedAt,
      deletionScheduledFor: scheduledFor,
      deletionReason: params.reason,
      deletionConfirmedAt: null,
    },
    select: { id: true, name: true },
  });

  const adminEmail = await getAdminEmail(org.id);

  await prisma.dataDeletionAudit.create({
    data: {
      organizationId: org.id,
      organizationName: org.name,
      adminEmail,
      event: "scheduled",
      reason: params.reason,
      scheduledFor,
    },
  });

  return { scheduledFor };
}

export async function cancelScheduledDeletion(params: {
  organizationId: string;
  canceledBy?: string | null;
}): Promise<{ wasScheduled: boolean }> {
  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: {
      id: true,
      name: true,
      deletionScheduledFor: true,
      deletionReason: true,
    },
  });
  if (!org || !org.deletionScheduledFor) return { wasScheduled: false };

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionReason: null,
      deletionConfirmedAt: null,
      trialExpiredGraceEndsAt: null,
    },
  });

  const adminEmail = await getAdminEmail(org.id);

  await prisma.dataDeletionAudit.create({
    data: {
      organizationId: org.id,
      organizationName: org.name,
      adminEmail,
      event: "canceled",
      reason: org.deletionReason,
      metadata: params.canceledBy ? { canceledBy: params.canceledBy } : undefined,
    },
  });

  return { wasScheduled: true };
}

export async function setTrialGracePeriod(params: {
  organizationId: string;
  from?: Date;
}): Promise<{ graceEndsAt: Date }> {
  const from = params.from ?? new Date();
  const graceEndsAt = addDays(from, DELETION_GRACE_DAYS);

  const org = await prisma.organization.update({
    where: { id: params.organizationId },
    data: { trialExpiredGraceEndsAt: graceEndsAt },
    select: { id: true, name: true },
  });

  const adminEmail = await getAdminEmail(org.id);

  await prisma.dataDeletionAudit.create({
    data: {
      organizationId: org.id,
      organizationName: org.name,
      adminEmail,
      event: "trial_grace_started",
      scheduledFor: graceEndsAt,
    },
  });

  return { graceEndsAt };
}

export function daysUntil(target: Date | null | undefined, now: Date = new Date()): number | null {
  if (!target) return null;
  const ms = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

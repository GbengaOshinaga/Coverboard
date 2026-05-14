import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured, resend } from "@/lib/email";
import { sendTeamInviteEmailStrict } from "@/lib/email-notifications";
import { recordAudit, requestAuditContext } from "@/lib/audit";

const RESENDS_PER_HOUR = 5;

/**
 * POST — Admin or manager resends the team invite email with a new temporary password.
 * Requires RESEND_API_KEY. On send failure, the member's password hash is restored.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;
  const actorId = sessionUser.id as string;
  const { id: memberId } = await params;

  if (memberId === actorId) {
    return NextResponse.json(
      { error: "You cannot resend an invite to your own account." },
      { status: 400 }
    );
  }

  if (!isEmailConfigured() || !resend) {
    return NextResponse.json(
      {
        error:
          "Outbound email is not configured. Add RESEND_API_KEY (and EMAIL_FROM) before resending invites.",
      },
      { status: 503 }
    );
  }

  const member = await prisma.user.findFirst({
    where: { id: memberId, organizationId: orgId },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentResends = await prisma.auditLog.count({
    where: {
      organizationId: orgId,
      action: "team_member.invite_resent",
      resourceId: memberId,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentResends >= RESENDS_PER_HOUR) {
    return NextResponse.json(
      {
        error: `Too many invite resends for this person in the last hour. Try again later (limit: ${RESENDS_PER_HOUR} per hour).`,
      },
      { status: 429 }
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  const orgName = org?.name ?? "your team";
  const inviterName = session.user.name ?? "Your admin";

  const tempPassword = Math.random().toString(36).slice(-10);
  const newPasswordHash = await bcrypt.hash(tempPassword, 10);
  const previousHash = member.passwordHash;

  await prisma.user.update({
    where: { id: member.id },
    data: { passwordHash: newPasswordHash },
  });

  try {
    await sendTeamInviteEmailStrict({
      inviteeName: member.name,
      inviterName,
      orgName,
      email: member.email,
      tempPassword,
    });
  } catch (err) {
    console.error("Resend invite email error:", err);
    await prisma.user.update({
      where: { id: member.id },
      data: { passwordHash: previousHash },
    });
    return NextResponse.json(
      {
        error:
          "Could not send the email. The member's password was not changed. Check your email provider configuration and try again.",
      },
      { status: 502 }
    );
  }

  await recordAudit({
    organizationId: orgId,
    action: "team_member.invite_resent",
    resource: "team_member",
    resourceId: member.id,
    actor: {
      id: actorId,
      email: session.user.email ?? null,
      role: userRole,
    },
    metadata: { email: member.email },
    context: requestAuditContext(request),
  });

  return NextResponse.json({ ok: true });
}

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import {
  teamInviteEmail,
  leaveRequestSubmittedEmail,
  leaveRequestStatusEmail,
  sspCapReachedEmail,
} from "@/lib/email-templates";
import { countWeekdays } from "@/lib/utils";

type EmailRecipient = { email: string };
import { SessionUser } from "./types";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// ─── Team Invite ─────────────────────────────────────────────────────

export async function sendTeamInviteEmail(data: {
  inviteeName: string;
  inviterName: string;
  orgName: string;
  email: string;
  tempPassword: string;
}) {
  const { subject, html } = teamInviteEmail({
    ...data,
    loginUrl: `${BASE_URL}/login`,
  });

  await sendEmail({ to: data.email, subject, html });
}

// ─── Leave Request Submitted (notify managers & admins) ──────────────

export async function emailNewRequest(data: {
  requesterName: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  note: string | null;
  organizationId: string;
}) {
  const managers: EmailRecipient[] = await prisma.user.findMany({
    where: {
      organizationId: data.organizationId,
      role: { in: ["ADMIN", "MANAGER"] },
    },
    select: { email: true },
  });

  if (managers.length === 0) return;

  const daysRequested = countWeekdays(data.startDate, data.endDate);

  const { subject, html } = leaveRequestSubmittedEmail({
    requesterName: data.requesterName,
    leaveTypeName: data.leaveTypeName,
    startDate: data.startDate,
    endDate: data.endDate,
    daysRequested,
    note: data.note,
    dashboardUrl: `${BASE_URL}/requests`,
  });

  await Promise.all(
    managers.map((m) => sendEmail({ to: m.email, subject, html }))
  );
}

// ─── Leave Request Status Change (notify requester) ──────────────────

export async function emailRequestStatusChange(data: {
  requesterEmail: string;
  requesterName: string;
  status: "APPROVED" | "REJECTED";
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  reviewerName: string;
}) {
  const daysRequested = countWeekdays(data.startDate, data.endDate);

  const { subject, html } = leaveRequestStatusEmail({
    requesterName: data.requesterName,
    status: data.status,
    leaveTypeName: data.leaveTypeName,
    startDate: data.startDate,
    endDate: data.endDate,
    daysRequested,
    reviewerName: data.reviewerName,
    dashboardUrl: `${BASE_URL}/requests`,
  });

  await sendEmail({ to: data.requesterEmail, subject, html });
}

// ─── SSP 28-week cap reached (notify admins) ─────────────────────────

export async function emailSspCapReached(data: {
  employeeName: string;
  sspEndDate: Date;
  organizationId: string;
}) {
  const admins: EmailRecipient[] = await prisma.user.findMany({
    where: {
      organizationId: data.organizationId,
      role: { in: ["ADMIN", "MANAGER"] },
    },
    select: { email: true },
  });

  if (admins.length === 0) return;

  const { subject, html } = sspCapReachedEmail({
    employeeName: data.employeeName,
    sspEndDate: data.sspEndDate,
    dashboardUrl: `${BASE_URL}/reports?tab=uk`,
  });

  await Promise.all(
    admins.map((m) => sendEmail({ to: m.email, subject, html }))
  );
}

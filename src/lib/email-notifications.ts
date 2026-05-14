import { prisma } from "@/lib/prisma";
import { sendEmail, resend, getFromAddress } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  teamInviteEmail,
  leaveRequestSubmittedEmail,
  leaveRequestStatusEmail,
  sspCapReachedEmail,
} from "@/lib/email-templates";
import { countWeekdays } from "@/lib/utils";

type EmailRecipient = { email: string };
import { SessionUser } from "./types";

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
    loginUrl: `${getAppBaseUrl()}/login`,
  });

  await sendEmail({ to: data.email, subject, html });
}

/** Same template as {@link sendTeamInviteEmail}; throws if email is not configured or Resend returns an error. */
export async function sendTeamInviteEmailStrict(data: {
  inviteeName: string;
  inviterName: string;
  orgName: string;
  email: string;
  tempPassword: string;
}): Promise<void> {
  if (!resend) {
    throw new Error("Email is not configured");
  }
  const { subject, html } = teamInviteEmail({
    ...data,
    loginUrl: `${getAppBaseUrl()}/login`,
  });
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: data.email,
    subject,
    html,
  });
  if (error) {
    const msg =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "Resend rejected the email";
    throw new Error(msg);
  }
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
    dashboardUrl: `${getAppBaseUrl()}/requests`,
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
    dashboardUrl: `${getAppBaseUrl()}/requests`,
  });

  await sendEmail({ to: data.requesterEmail, subject, html });
}

// ─── Parental Leave Return Alert (notify managers 4 weeks before return) ──

export async function emailParentalLeaveReturnAlert(data: {
  employeeName: string;
  returnDate: Date;
  leaveTypeName: string;
  organizationId: string;
}) {
  const managers = await prisma.user.findMany({
    where: {
      organizationId: data.organizationId,
      role: { in: ["ADMIN", "MANAGER"] },
    },
    select: { email: true },
  });

  if (managers.length === 0) return;

  const returnStr = data.returnDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const subject = `Return from ${data.leaveTypeName}: ${data.employeeName} returns on ${returnStr}`;
  const html = `<p>${data.employeeName} is due to return from ${data.leaveTypeName} on <strong>${returnStr}</strong>.</p>
<p>Please ensure their role and workspace are ready and that any flexible working requests are processed in advance.</p>
<p><a href="${getAppBaseUrl()}/team">View team calendar</a></p>`;

  await Promise.all(
    managers.map((m) => sendEmail({ to: m.email, subject, html }))
  );
}

/**
 * Find all approved parental leave requests ending within the next 4 weeks
 * and send return alerts. Designed to be called from a scheduled job daily.
 */
export async function sendUpcomingParentalReturnAlerts(): Promise<number> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() + 27); // 27–28 days out = ~4 weeks
  const windowEnd = new Date(now);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 28);

  const returning = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      endDate: { gte: windowStart, lte: windowEnd },
      leaveType: { name: { in: ["Statutory Maternity Leave", "Statutory Paternity Leave", "Shared Parental Leave (SPL)", "Adoption Leave", "Unpaid Parental Leave"] } },
    },
    include: {
      user: { select: { name: true, organizationId: true } },
      leaveType: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const req of returning) {
    await emailParentalLeaveReturnAlert({
      employeeName: req.user.name,
      returnDate: new Date(req.endDate.getTime() + 86400_000), // day after leave ends
      leaveTypeName: req.leaveType.name,
      organizationId: req.user.organizationId,
    }).catch((err) => console.error("Parental return alert error:", err));
    sent++;
  }
  return sent;
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
    dashboardUrl: `${getAppBaseUrl()}/reports?tab=uk`,
  });

  await Promise.all(
    admins.map((m) => sendEmail({ to: m.email, subject, html }))
  );
}

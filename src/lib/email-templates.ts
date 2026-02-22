import { formatDateRange, countWeekdays, getInitials } from "@/lib/utils";

const BRAND_COLOR = "#2563eb";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:32px 32px 0;">
              <div style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;font-weight:bold;font-size:14px;padding:6px 10px;border-radius:6px;margin-bottom:24px;">CB</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Sent by Coverboard &middot; Team leave management</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;font-weight:600;font-size:14px;padding:10px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">${text}</a>`;
}

// ─── Weekly Digest ───────────────────────────────────────────────────

type DigestAbsence = {
  name: string;
  leaveType: string;
  leaveColor: string;
  startDate: Date;
  endDate: Date;
};

function absenceRow(a: DigestAbsence): string {
  const initials = getInitials(a.name);
  return `
    <tr>
      <td style="padding:8px 0;vertical-align:middle;">
        <div style="display:inline-block;width:32px;height:32px;border-radius:50%;background-color:#e5e7eb;text-align:center;line-height:32px;font-size:12px;font-weight:600;color:#4b5563;">${initials}</div>
      </td>
      <td style="padding:8px 8px;vertical-align:middle;">
        <div style="font-size:14px;font-weight:600;color:#111827;">${a.name}</div>
        <div style="font-size:12px;color:#6b7280;">${formatDateRange(a.startDate, a.endDate)}</div>
      </td>
      <td style="padding:8px 0;vertical-align:middle;text-align:right;">
        <span style="display:inline-block;background-color:${a.leaveColor}20;color:${a.leaveColor};font-size:12px;font-weight:600;padding:2px 8px;border-radius:4px;">${a.leaveType}</span>
      </td>
    </tr>`;
}

function absenceTable(absences: DigestAbsence[]): string {
  if (absences.length === 0) {
    return `<p style="margin:0;font-size:14px;color:#9ca3af;padding:12px 0;">No one is off during this period.</p>`;
  }
  return `<table cellpadding="0" cellspacing="0" style="width:100%;">${absences.map(absenceRow).join("")}</table>`;
}

export function weeklyDigestEmail(data: {
  recipientName: string;
  orgName: string;
  weekLabel: string;
  outThisWeek: DigestAbsence[];
  outNextWeek: DigestAbsence[];
  pendingCount: number;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const pendingNote = data.pendingCount > 0
    ? `<div style="background-color:#fef3c7;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">${data.pendingCount} pending request${data.pendingCount !== 1 ? "s" : ""} awaiting review</p>
      </div>`
    : "";

  return {
    subject: `Weekly leave digest — ${data.weekLabel}`,
    html: layout(`
      <h1 style="margin:0 0 4px;font-size:20px;color:#111827;">Weekly leave digest</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">
        Hi ${data.recipientName}, here&rsquo;s the leave overview for ${data.orgName}.
      </p>

      ${pendingNote}

      <h2 style="margin:0 0 8px;font-size:16px;color:#111827;">Out this week</h2>
      <div style="background-color:#f9fafb;border-radius:6px;padding:8px 16px;margin-bottom:20px;">
        ${absenceTable(data.outThisWeek)}
      </div>

      <h2 style="margin:0 0 8px;font-size:16px;color:#111827;">Out next week</h2>
      <div style="background-color:#f9fafb;border-radius:6px;padding:8px 16px;margin-bottom:16px;">
        ${absenceTable(data.outNextWeek)}
      </div>

      ${button("Open dashboard", data.dashboardUrl)}
    `),
  };
}

// ─── Password Reset ──────────────────────────────────────────────────

export function passwordResetEmail(data: {
  userName: string;
  resetUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "Reset your Coverboard password",
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Reset your password</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${data.userName}, we received a request to reset the password for your Coverboard account.
        Click the button below to choose a new password.
      </p>
      ${button("Reset password", data.resetUrl)}
      <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
        This link expires in 1 hour. If you didn&rsquo;t request a password reset, you can safely ignore this email.
      </p>
    `),
  };
}

// ─── Team Invite ─────────────────────────────────────────────────────

export function teamInviteEmail(data: {
  inviteeName: string;
  inviterName: string;
  orgName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `${data.inviterName} invited you to ${data.orgName} on Coverboard`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">You've been invited to ${data.orgName}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        ${data.inviterName} has added you to their team on Coverboard — a simple way to manage team leave, see who's out, and plan coverage.
      </p>
      <div style="background-color:#f9fafb;border-radius:6px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Your login credentials:</p>
        <p style="margin:0 0 4px;font-size:14px;color:#111827;"><strong>Email:</strong> ${data.email}</p>
        <p style="margin:0;font-size:14px;color:#111827;"><strong>Temporary password:</strong> ${data.tempPassword}</p>
      </div>
      <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Please change your password after your first login.</p>
      ${button("Sign in to Coverboard", data.loginUrl)}
    `),
  };
}

// ─── Leave Request Submitted (to managers) ───────────────────────────

export function leaveRequestSubmittedEmail(data: {
  requesterName: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  note: string | null;
  dashboardUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `New leave request from ${data.requesterName} — ${data.leaveTypeName}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">New leave request</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        ${data.requesterName} has submitted a leave request that needs your review.
      </p>
      <div style="background-color:#f9fafb;border-radius:6px;padding:16px;margin-bottom:16px;">
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
          <tr>
            <td style="padding:4px 0;color:#6b7280;width:100px;">Type</td>
            <td style="padding:4px 0;color:#111827;font-weight:600;">${data.leaveTypeName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Dates</td>
            <td style="padding:4px 0;color:#111827;">${formatDateRange(data.startDate, data.endDate)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Duration</td>
            <td style="padding:4px 0;color:#111827;">${data.daysRequested} weekday${data.daysRequested !== 1 ? "s" : ""}</td>
          </tr>
          ${data.note ? `<tr><td style="padding:4px 0;color:#6b7280;">Note</td><td style="padding:4px 0;color:#111827;">${data.note}</td></tr>` : ""}
        </table>
      </div>
      ${button("Review request", data.dashboardUrl)}
    `),
  };
}

// ─── Leave Request Status Update (to requester) ─────────────────────

export function leaveRequestStatusEmail(data: {
  requesterName: string;
  status: "APPROVED" | "REJECTED";
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  reviewerName: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const isApproved = data.status === "APPROVED";
  const statusText = isApproved ? "approved" : "rejected";
  const statusColor = isApproved ? "#059669" : "#dc2626";

  return {
    subject: `Your ${data.leaveTypeName} request was ${statusText}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Leave request ${statusText}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${data.requesterName}, your leave request has been
        <strong style="color:${statusColor};">${statusText}</strong>
        by ${data.reviewerName}.
      </p>
      <div style="background-color:#f9fafb;border-radius:6px;padding:16px;margin-bottom:16px;">
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
          <tr>
            <td style="padding:4px 0;color:#6b7280;width:100px;">Type</td>
            <td style="padding:4px 0;color:#111827;font-weight:600;">${data.leaveTypeName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Dates</td>
            <td style="padding:4px 0;color:#111827;">${formatDateRange(data.startDate, data.endDate)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Duration</td>
            <td style="padding:4px 0;color:#111827;">${data.daysRequested} weekday${data.daysRequested !== 1 ? "s" : ""}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Status</td>
            <td style="padding:4px 0;color:${statusColor};font-weight:600;">${data.status}</td>
          </tr>
        </table>
      </div>
      ${button("View in Coverboard", data.dashboardUrl)}
    `),
  };
}

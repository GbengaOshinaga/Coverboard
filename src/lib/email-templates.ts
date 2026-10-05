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
              <p style="margin:0;font-size:12px;color:#9ca3af;">Sent by Coverboard &middot; Staff cover for shift-based teams</p>
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
        <div style="display:inline-block;width:32px;height:32px;border-radius:50%;background-color:#e5e7eb;text-align:center;line-height:32px;font-size:12px;font-weight:600;color:#4b5563;">${esc(initials)}</div>
      </td>
      <td style="padding:8px 8px;vertical-align:middle;">
        <div style="font-size:14px;font-weight:600;color:#111827;">${esc(a.name)}</div>
        <div style="font-size:12px;color:#6b7280;">${formatDateRange(a.startDate, a.endDate)}</div>
      </td>
      <td style="padding:8px 0;vertical-align:middle;text-align:right;">
        <span style="display:inline-block;background-color:${safeColor(a.leaveColor)}20;color:${safeColor(a.leaveColor)};font-size:12px;font-weight:600;padding:2px 8px;border-radius:4px;">${esc(a.leaveType)}</span>
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
  /** Per-recipient signed unsubscribe URL. PECR Reg 22 + Gmail bulk-sender. */
  unsubscribeUrl: string;
  /** Optional link to in-app preferences for users who want to log in. */
  preferencesUrl?: string;
}): { subject: string; html: string } {
  const pendingNote = data.pendingCount > 0
    ? `<div style="background-color:#fef3c7;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">${data.pendingCount} pending request${data.pendingCount !== 1 ? "s" : ""} awaiting review</p>
      </div>`
    : "";

  const preferencesLink = data.preferencesUrl
    ? ` · <a href="${data.preferencesUrl}" style="color:#9ca3af;text-decoration:underline;">manage email preferences</a>`
    : "";

  return {
    subject: `Weekly leave digest — ${data.weekLabel}`,
    html: layout(`
      <h1 style="margin:0 0 4px;font-size:20px;color:#111827;">Weekly leave digest</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">
        Hi ${esc(data.recipientName)}, here&rsquo;s the leave overview for ${esc(data.orgName)}.
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

      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5;">
        You&rsquo;re receiving this because you&rsquo;re an admin or manager
        at ${esc(data.orgName)}.
        <a href="${data.unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from the weekly digest</a>${preferencesLink}.
      </p>
    `),
  };
}

// ─── Monthly Compliance Snapshot ─────────────────────────────────────

export type ComplianceSnapshotEmailInput = {
  recipientName: string;
  orgName: string;
  monthLabel: string;
  reportUrl: string;
  activeUkEmployees: number;
  leavesThisMonth: { total: number; sickness: number; other: number };
  bradfordAlerts: ReadonlyArray<{ name: string; score: number }>;
  parentalActive: number;
  parentalReturningSoon: ReadonlyArray<{
    name: string;
    leaveTypeName: string;
    endDate: Date;
  }>;
  rightToWorkUnverifiedCount: number;
  rightToWorkUnverifiedSample: ReadonlyArray<{ name: string }>;
  isAllClear: boolean;
};

export function monthlyComplianceReportEmail(
  data: ComplianceSnapshotEmailInput
): { subject: string; html: string } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const sections: string[] = [];

  sections.push(`
    <div style="margin-bottom:16px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Workforce</p>
      <p style="margin:0;font-size:14px;color:#111827;">
        <strong>${data.activeUkEmployees}</strong> active UK
        ${data.activeUkEmployees === 1 ? "employee" : "employees"} ·
        <strong>${data.leavesThisMonth.total}</strong> leave${data.leavesThisMonth.total === 1 ? "" : "s"} this month
        (${data.leavesThisMonth.sickness} sickness, ${data.leavesThisMonth.other} other)
      </p>
    </div>
  `);

  if (data.bradfordAlerts.length > 0) {
    const rows = data.bradfordAlerts
      .map(
        (b) =>
          `<li style="margin:0 0 4px;font-size:13px;color:#374151;"><strong>${b.name}</strong> &mdash; score ${b.score}</li>`
      )
      .join("");
    sections.push(`
      <div style="margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:13px;color:#b91c1c;text-transform:uppercase;letter-spacing:0.05em;">Bradford Factor alerts</p>
        <ul style="margin:0;padding-left:20px;">${rows}</ul>
      </div>
    `);
  }

  if (data.parentalActive > 0) {
    const returningHtml =
      data.parentalReturningSoon.length > 0
        ? `<ul style="margin:4px 0 0;padding-left:20px;">${data.parentalReturningSoon
            .map(
              (p) =>
                `<li style="margin:0 0 2px;font-size:13px;color:#374151;"><strong>${esc(p.name)}</strong> &mdash; ${esc(p.leaveTypeName)}, returning ${fmt.format(p.endDate)}</li>`
            )
            .join("")}</ul>`
        : "";
    sections.push(`
      <div style="margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Parental leave</p>
        <p style="margin:0;font-size:14px;color:#111827;">
          <strong>${data.parentalActive}</strong> active${
            data.parentalReturningSoon.length > 0
              ? ` &mdash; ${data.parentalReturningSoon.length} returning in the next 30 days`
              : ""
          }
        </p>
        ${returningHtml}
      </div>
    `);
  }

  if (data.rightToWorkUnverifiedCount > 0) {
    const sampleNames = data.rightToWorkUnverifiedSample
      .map((u) => u.name)
      .join(", ");
    const overflow =
      data.rightToWorkUnverifiedCount - data.rightToWorkUnverifiedSample.length;
    sections.push(`
      <div style="margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:13px;color:#b45309;text-transform:uppercase;letter-spacing:0.05em;">Right to work</p>
        <p style="margin:0;font-size:14px;color:#111827;">
          <strong>${data.rightToWorkUnverifiedCount}</strong>
          ${data.rightToWorkUnverifiedCount === 1 ? "employee" : "employees"} unverified
          ${sampleNames ? `&mdash; ${esc(sampleNames)}` : ""}${overflow > 0 ? ` (+${overflow} more)` : ""}
        </p>
      </div>
    `);
  }

  if (data.isAllClear) {
    sections.push(`
      <div style="margin-bottom:16px;background-color:#ecfdf5;border-radius:6px;padding:12px;">
        <p style="margin:0;font-size:14px;color:#065f46;">
          Nothing flagged this month &mdash; no Bradford alerts, no unverified
          right-to-work, no active parental leave. Quiet is good.
        </p>
      </div>
    `);
  }

  return {
    subject: `${data.monthLabel} compliance snapshot — ${data.orgName}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${data.monthLabel} compliance snapshot</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.recipientName)}, here&rsquo;s your monthly view of
        ${esc(data.orgName)}&rsquo;s UK compliance position. Click through for the
        full breakdown.
      </p>
      ${sections.join("\n")}
      ${button("Open compliance report", data.reportUrl)}
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Sent on the 1st of each month to admins and managers. You can adjust
        notification preferences in your profile settings.
      </p>
    `),
  };
}

// ─── Fit Note Alerts ─────────────────────────────────────────────────

export type FitNoteAlertItem = {
  userName: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  /** Days off so far, or in total when the absence has ended. */
  daysOff: number;
  ended: boolean;
};

export function fitNoteAlertEmail(data: {
  recipientName: string;
  orgName: string;
  items: ReadonlyArray<FitNoteAlertItem>;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const rows = data.items
    .map(
      (i) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 0;font-size:14px;color:#111827;">${esc(i.userName)}</td>
        <td style="padding:8px 0;font-size:13px;color:#6b7280;">${esc(i.leaveTypeName)}</td>
        <td style="padding:8px 0;font-size:13px;color:#6b7280;">${fmt.format(i.startDate)} – ${fmt.format(i.endDate)}</td>
        <td style="padding:8px 0;font-size:13px;color:#b91c1c;font-weight:500;">${i.ended ? `Ended (${i.daysOff} days)` : `Day ${i.daysOff}`}</td>
      </tr>`
    )
    .join("");

  const count = data.items.length;
  const headline =
    count === 1
      ? "1 employee owes you a fit note"
      : `${count} employees owe you fit notes`;

  return {
    subject: `${headline} — ${data.orgName}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${headline}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.recipientName)}, the following approved sickness absences
        have run past 7 calendar days without a fit note recorded in
        Coverboard. UK SSP rules require a Statement of Fitness for Work
        from day 8 onwards. Without it on file, ${esc(data.orgName)} can&rsquo;t
        evidence SSP payments to HMRC.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="border-bottom:2px solid #e5e7eb;">
            <th align="left" style="padding:8px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Employee</th>
            <th align="left" style="padding:8px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Leave</th>
            <th align="left" style="padding:8px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Dates</th>
            <th align="left" style="padding:8px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Overdue</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${button("Open dashboard", data.dashboardUrl)}
      <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
        Once you receive a fit note, mark <strong>Evidence provided</strong>
        on the relevant leave request to clear the alert. You&rsquo;ll get a
        fresh summary next Monday if any are still outstanding.
      </p>
    `),
  };
}

// ─── Email Verification ──────────────────────────────────────────────

export function emailVerificationEmail(data: {
  userName: string;
  verifyUrl: string;
  expiresInHours: number;
}): { subject: string; html: string } {
  return {
    subject: "Verify your email for Coverboard",
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Confirm your email</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.userName)}, please confirm that this email belongs to you so
        we can finish setting up your Coverboard account.
      </p>
      ${button("Verify email", data.verifyUrl)}
      <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
        This link expires in ${data.expiresInHours} hours. If you didn&rsquo;t
        create a Coverboard account, you can safely ignore this email — no
        account will be created without confirmation.
      </p>
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
        Hi ${esc(data.userName)}, we received a request to reset the password for your Coverboard account.
        Click the button below to choose a new password.
      </p>
      ${button("Reset password", data.resetUrl)}
      <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
        This link expires in 1 hour. If you didn&rsquo;t request a password reset, you can safely ignore this email.
      </p>
    `),
  };
}

// ─── Signup Welcome ──────────────────────────────────────────────────

export function signupWelcomeEmail(data: {
  userName: string;
  orgName: string;
  planName: string;
  trialDays: number;
  dashboardUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Welcome to Coverboard — ${data.orgName} is ready`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Welcome to Coverboard</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.userName)}, your team <strong>${esc(data.orgName)}</strong> is set up and you&rsquo;re the admin.
        You&rsquo;re on a ${data.trialDays}-day free trial of the <strong>${data.planName}</strong> plan &mdash; no card required.
      </p>
      <div style="background-color:#f9fafb;border-radius:6px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111827;">Get started</p>
        <ul style="margin:0;padding-left:20px;font-size:14px;color:#6b7280;line-height:1.7;">
          <li>Complete onboarding to configure leave types</li>
          <li>Invite your team from the Team page</li>
          <li>See who&rsquo;s out on your dashboard calendar</li>
        </ul>
      </div>
      ${button("Open dashboard", data.dashboardUrl)}
      <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
        If you didn&rsquo;t create this account, you can ignore this email.
      </p>
    `),
  };
}

// ─── Team Invite ─────────────────────────────────────────────────────

/** No password in the email: a one-time link lets them choose their own. */
export function teamInviteEmail(data: {
  inviteeName: string;
  inviterName: string;
  orgName: string;
  email: string;
  setPasswordUrl: string;
  linkDays: number;
}): { subject: string; html: string } {
  return {
    subject: `${data.inviterName} invited you to ${data.orgName} on Coverboard`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">You've been invited to ${esc(data.orgName)}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.inviteeName)}, ${esc(data.inviterName)} has added you to their team on Coverboard, where you can book time off, report sickness and see cover requests.
      </p>
      <p style="margin:0 0 4px;font-size:14px;color:#111827;">
        Choose a password to get started. You'll sign in with <strong>${esc(data.email)}</strong>.
      </p>
      ${button("Set your password", data.setPasswordUrl)}
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
        This link works once and expires in ${data.linkDays} days. If it has expired, ask ${esc(data.inviterName)} to resend your invite.
      </p>
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
        ${esc(data.requesterName)} has submitted a leave request that needs your review.
      </p>
      <div style="background-color:#f9fafb;border-radius:6px;padding:16px;margin-bottom:16px;">
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
          <tr>
            <td style="padding:4px 0;color:#6b7280;width:100px;">Type</td>
            <td style="padding:4px 0;color:#111827;font-weight:600;">${esc(data.leaveTypeName)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Dates</td>
            <td style="padding:4px 0;color:#111827;">${formatDateRange(data.startDate, data.endDate)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Duration</td>
            <td style="padding:4px 0;color:#111827;">${data.daysRequested} weekday${data.daysRequested !== 1 ? "s" : ""}</td>
          </tr>
          ${data.note ? `<tr><td style="padding:4px 0;color:#6b7280;">Note</td><td style="padding:4px 0;color:#111827;">${esc(data.note)}</td></tr>` : ""}
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
  /** A manager recorded this leave for them; they didn't request it. */
  recorded?: boolean;
}): { subject: string; html: string } {
  const isApproved = data.status === "APPROVED";
  const statusText = isApproved ? "approved" : "rejected";
  const statusColor = isApproved ? "#059669" : "#dc2626";

  return {
    subject: data.recorded
      ? `Your ${data.leaveTypeName} has been recorded`
      : `Your ${data.leaveTypeName} request was ${statusText}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${data.recorded ? "Leave recorded" : `Leave request ${statusText}`}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        ${
          data.recorded
            ? `Hi ${esc(data.requesterName)}, ${esc(data.reviewerName)} has recorded this leave for you. It&rsquo;s approved.`
            : `Hi ${esc(data.requesterName)}, your leave request has been
        <strong style="color:${statusColor};">${statusText}</strong>
        by ${esc(data.reviewerName)}.`
        }
      </p>
      <div style="background-color:#f9fafb;border-radius:6px;padding:16px;margin-bottom:16px;">
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
          <tr>
            <td style="padding:4px 0;color:#6b7280;width:100px;">Type</td>
            <td style="padding:4px 0;color:#111827;font-weight:600;">${esc(data.leaveTypeName)}</td>
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

// ─── SSP 28-week cap reached (to admins) ────────────────────────────

export function sspCapReachedEmail(data: {
  employeeName: string;
  sspEndDate: Date;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const endDateLabel = data.sspEndDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    subject: `${data.employeeName} has reached the 28-week SSP limit`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">SSP 28-week limit reached</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        ${esc(data.employeeName)} has reached the 28-week Statutory Sick Pay limit.
        SSP ends <strong style="color:#111827;">${endDateLabel}</strong>.
      </p>
      <div style="background-color:#fef3c7;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
          The employee may be eligible for Employment Support Allowance (ESA).
          Issue form SSP1 within 7 days of SSP ending so the employee can
          claim ESA from the DWP.
        </p>
      </div>
      ${button("Review in Coverboard", data.dashboardUrl)}
    `),
  };
}

// ─── Founder outreach ────────────────────────────────────────────────
//
// Deliberately plain — no banner, no buttons, no card chrome. Reads like a
// real person typed it in their mail client. The goal is "founder reaches
// out personally" not "another transactional email from a brand". Sent
// once per organisation, capped at the first N verified signups
// (controlled by FOUNDER_OUTREACH_CAP, default 100).

export function founderOutreachEmail(data: {
  firstName: string;
  founderName: string;
  replyAddress: string;
}): { subject: string; html: string } {
  const safeName = data.firstName || "there";
  const body = `
    <p>Hi ${esc(safeName)},</p>
    <p>I&rsquo;m ${esc(data.founderName)}, the founder of Coverboard. Your signup
    came through and I wanted to reach out personally — thank you for
    trying us out.</p>
    <p>A couple of things that tend to help people get going:</p>
    <ul>
      <li>The team page is the fastest way to add your first few members.</li>
      <li>If you&rsquo;re managing UK statutory leave, the settings page
      has a one-click toggle to seed SSP, SMP, paternity and the rest.</li>
      <li>Anything not working the way you&rsquo;d expect? Just reply to
      this email — it comes straight to me, not a support queue.</li>
    </ul>
    <p>What brought you to Coverboard? I read every reply.</p>
    <p>Thanks again,<br/>${esc(data.founderName)}</p>
  `;
  return {
    subject: `Welcome to Coverboard — quick note from ${data.founderName}`,
    html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:560px;margin:32px auto;padding:0 16px;">${body}<p style="margin-top:24px;font-size:12px;color:#9ca3af;">Replies go to ${esc(data.replyAddress)}.</p></body></html>`,
  };
}

// ─── Cover offers ───────────────────────────────────────────────────

/**
 * Escapes text for email HTML. Every name, leave type, note and team name is
 * typed by someone, so it goes through this — otherwise a name like
 * `<a href=…>` would render as a link in a manager's inbox. Subject lines are
 * plain text and aren't escaped.
 */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Leave type colours go into a style attribute: only plain hex colours. */
function safeColor(color: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#6b7280";
}

function shiftLine(data: { shiftName: string; date: Date; startTime: string; endTime: string; locationName: string }) {
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(data.date);
  return `<div style="background-color:#f9fafb;border-radius:6px;padding:16px;margin-bottom:16px;font-size:14px;color:#111827;">
        <strong>${esc(data.shiftName)} shift</strong>, ${day}<br>
        <span style="color:#6b7280;">${data.startTime}–${data.endTime} · ${esc(data.locationName)}</span>
      </div>`;
}

/**
 * To the person being asked — one email however many shifts they were asked
 * about at once. They answer each in the app; nothing is assumed.
 */
export function coverOfferEmail(data: {
  recipientName: string;
  managerName: string;
  shifts: Array<{ shiftName: string; date: Date; startTime: string; endTime: string; locationName: string }>;
  url: string;
}): { subject: string; html: string } {
  const many = data.shifts.length > 1;
  return {
    subject: many
      ? `Can you cover ${data.shifts.length} shifts?`
      : `Can you cover the ${data.shifts[0].shiftName} shift?`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Can you cover ${many ? "some shifts" : "a shift"}?</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.recipientName)}, ${esc(data.managerName)} has asked if you can cover:
      </p>
      ${data.shifts.map(shiftLine).join("")}
      <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
        Please accept or decline ${many ? "each one" : ""} in Coverboard. If someone else covers a shift first, it'll show as covered there.
      </p>
      ${button("Accept or decline", data.url)}
    `),
  };
}

/** To the manager who asked. */
export function coverOfferAnsweredEmail(data: {
  managerName: string;
  responderName: string;
  accepted: boolean;
  shiftName: string;
  date: Date;
  startTime: string;
  endTime: string;
  locationName: string;
  url: string;
}): { subject: string; html: string } {
  const verb = data.accepted ? "will cover" : "can't cover";
  return {
    subject: `${data.responderName} ${verb} the ${data.shiftName} shift`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${esc(data.responderName)} ${verb} the shift</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.managerName)}, ${esc(data.responderName)} has
        <strong style="color:${data.accepted ? "#059669" : "#dc2626"};">${data.accepted ? "accepted" : "declined"}</strong>
        your request to cover:
      </p>
      ${shiftLine(data)}
      ${button("View cover", data.url)}
    `),
  };
}

// ─── Founder alerts (internal) ──────────────────────────────────────

function factRows(rows: Array<[string, string]>): string {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">${rows
    .map(
      ([k, v]) => `<tr>
        <td style="padding:4px 0;color:#6b7280;width:140px;vertical-align:top;">${esc(k)}</td>
        <td style="padding:4px 0;color:#111827;">${esc(v)}</td>
      </tr>`
    )
    .join("")}</table>`;
}

/** To the founder: a team just signed up. */
export function signupAlertEmail(data: {
  orgName: string;
  adminName: string;
  adminEmail: string;
  plan: string;
  billingCountry: string;
  method: string;
  at: Date;
}): { subject: string; html: string } {
  return {
    subject: `New signup: ${data.orgName}`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">New signup: ${esc(data.orgName)}</h1>
      ${factRows([
        ["Admin", `${data.adminName} <${data.adminEmail}>`],
        ["Plan", data.plan],
        ["Billing country", data.billingCountry],
        ["Signed up with", data.method === "google" ? "Google" : "Email and password"],
        ["When", data.at.toUTCString()],
      ])}
      <p style="margin:16px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
        You'll get another email if they finish setting up. Reply to them from your own inbox if you want to say hello.
      </p>
    `),
  };
}

/** To the founder: a team finished onboarding. */
export function setupCompletedAlertEmail(data: {
  orgName: string;
  adminEmail: string | null;
  countries: string[];
  industry: string | null;
  locationsEnabled: boolean;
  invitesSent: number;
}): { subject: string; html: string } {
  return {
    subject: `${data.orgName} finished setting up`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${esc(data.orgName)} finished setting up</h1>
      ${factRows([
        ["Admin", data.adminEmail ?? "—"],
        ["Countries", data.countries.join(", ")],
        ["Industry", data.industry ?? "Not given"],
        ["Locations & cover", data.locationsEnabled ? "Turned on" : "Off"],
        ["People invited", String(data.invitesSent)],
      ])}
    `),
  };
}

/** A covered shift changed after it was agreed (either side pulled out). */
export function coverChangedEmail(data: {
  recipientName: string;
  headline: string;
  message: string;
  shiftName: string;
  date: Date;
  startTime: string;
  endTime: string;
  locationName: string;
  url: string;
  buttonText: string;
}): { subject: string; html: string } {
  return {
    subject: data.headline,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${esc(data.headline)}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.recipientName)}, ${esc(data.message)}
      </p>
      ${shiftLine(data)}
      ${button(data.buttonText, data.url)}
    `),
  };
}

// ─── Right-to-work rechecks (Monday, Growth+) ───────────────────────

export function rightToWorkRecheckEmail(data: {
  recipientName: string;
  orgName: string;
  /** Expired first, then soonest. */
  items: ReadonlyArray<{ name: string; expiresOn: Date; expired: boolean }>;
  reportUrl: string;
}): { subject: string; html: string } {
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const expired = data.items.filter((i) => i.expired).length;
  const rows = data.items
    .map(
      (i) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 0;font-size:14px;color:#111827;">${esc(i.name)}</td>
        <td style="padding:8px 0;font-size:13px;color:${i.expired ? "#b91c1c" : "#b45309"};font-weight:500;">
          ${i.expired ? `Permission expired ${fmt(i.expiresOn)}: recheck now` : `Recheck before ${fmt(i.expiresOn)}`}
        </td>
      </tr>`
    )
    .join("");
  return {
    subject:
      expired > 0
        ? `${expired} right-to-work check${expired === 1 ? "" : "s"} expired — ${data.orgName}`
        : `Right-to-work rechecks due soon — ${data.orgName}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Right-to-work rechecks</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${esc(data.recipientName)}, these people at ${esc(data.orgName)} have
        time-limited permission to work. It has to be checked again before it
        ends; record the new check on their profile.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">${rows}</table>
      ${button("Open right-to-work report", data.reportUrl)}
    `),
  };
}

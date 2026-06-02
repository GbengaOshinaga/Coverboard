import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export function isEmailConfigured(): boolean {
  return !!resendApiKey;
}

export function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? "Coverboard <noreply@coverboard.io>";
}

export async function sendEmail({
  to,
  subject,
  html,
  headers,
}: {
  to: string;
  subject: string;
  html: string;
  /**
   * Extra SMTP headers. Used for `List-Unsubscribe` /
   * `List-Unsubscribe-Post` on bulk emails (weekly digest) — Gmail and
   * Outlook surface a one-click unsubscribe button when these are set,
   * which improves deliverability and is required by Gmail for bulk
   * senders sending more than 5,000 messages/day.
   */
  headers?: Record<string, string>;
}) {
  if (!resend) {
    console.log(`[Email skipped — not configured] To: ${to}, Subject: ${subject}`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
      ...(headers ? { headers } : {}),
    });
    if (error) {
      console.error(`Failed to send email to ${to}:`, error);
    }
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
  }
}

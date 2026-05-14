import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export function isEmailConfigured(): boolean {
  return !!resendApiKey;
}

export function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? "Coverboard <noreply@coverboard.app>";
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
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
    });
    if (error) {
      console.error(`Failed to send email to ${to}:`, error);
    }
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
  }
}

/**
 * Tells the founder when a team signs up, and again when it finishes
 * onboarding — so no signup goes unnoticed.
 *
 * Configuration:
 *   SIGNUP_ALERT_TO  comma-separated recipients; "off" disables. Defaults to
 *                    FOUNDER_REPLY_TO, then hello@coverboard.io. On Vercel
 *                    preview deploys it stays quiet unless set explicitly, so
 *                    test signups there don't email you.
 *
 * Always fire-and-forget: an alert failing must never fail a signup.
 */
import { sendEmail } from "@/lib/email";
import { signupAlertEmail, setupCompletedAlertEmail } from "@/lib/email-templates";

type Env = Record<string, string | undefined>;

export function signupAlertRecipients(env: Env = process.env): string[] {
  const raw = env.SIGNUP_ALERT_TO?.trim();
  if (raw?.toLowerCase() === "off") return [];
  if (!raw && env.VERCEL_ENV === "preview") return [];
  const value = raw || env.FOUNDER_REPLY_TO?.trim() || "hello@coverboard.io";
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function send(subject: string, html: string): void {
  for (const to of signupAlertRecipients()) {
    sendEmail({ to, subject, html }).catch((err) => console.error("Signup alert email failed:", err));
  }
}

export function alertNewSignup(data: {
  orgName: string;
  adminName: string;
  adminEmail: string;
  plan: string;
  billingCountry: string;
  method: string;
}): void {
  try {
    const { subject, html } = signupAlertEmail({ ...data, at: new Date() });
    send(subject, html);
  } catch (err) {
    console.error("Signup alert failed:", err);
  }
}

export function alertSetupCompleted(data: {
  orgName: string;
  adminEmail: string | null;
  countries: string[];
  industry: string | null;
  locationsEnabled: boolean;
  invitesSent: number;
}): void {
  try {
    const { subject, html } = setupCompletedAlertEmail(data);
    send(subject, html);
  } catch (err) {
    console.error("Setup alert failed:", err);
  }
}

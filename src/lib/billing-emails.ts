/**
 * Email templates for billing lifecycle events. Uses the shared sendEmail()
 * helper in lib/email.ts (Resend) and falls back to console.log when
 * RESEND_API_KEY is absent.
 */
import { sendEmail } from "@/lib/email";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://app.coverboard.app";

function base(content: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:560px;margin:40px auto;padding:32px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;">
  ${content}
  <p style="margin-top:24px;color:#6b7280;font-size:12px">— The Coverboard team</p>
  </body></html>`;
}

export async function emailTrialEndingSoon({ to, daysLeft }: { to: string; daysLeft: number }) {
  await sendEmail({
    to,
    subject: `Your Coverboard trial ends in ${daysLeft} days`,
    html: base(`
      <h2 style="margin:0 0 12px">Your trial ends in ${daysLeft} days</h2>
      <p>Add your payment details now to keep your Coverboard account active.</p>
      <p><a href="${APP_URL}/settings/billing/add-payment" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Add payment details</a></p>
    `),
  });
}

export async function emailPaymentFailed({ to }: { to: string }) {
  await sendEmail({
    to,
    subject: "Your Coverboard payment failed",
    html: base(`
      <h2 style="margin:0 0 12px">Payment failed</h2>
      <p>We couldn&apos;t charge your card. Stripe will retry automatically, but
      updating your payment method now avoids any interruption.</p>
      <p><a href="${APP_URL}/settings/billing/add-payment" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Update payment method</a></p>
    `),
  });
}

export async function emailSubscriptionCanceled({ to }: { to: string }) {
  await sendEmail({
    to,
    subject: "Your Coverboard subscription was canceled",
    html: base(`
      <h2 style="margin:0 0 12px">Subscription canceled</h2>
      <p>Your Coverboard subscription has been canceled. Your data is preserved
      for 90 days. Reactivate any time from the billing page.</p>
      <p><a href="${APP_URL}/settings/billing" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Reactivate</a></p>
    `),
  });
}

export async function emailWelcomeActive({ to, planName }: { to: string; planName: string }) {
  await sendEmail({
    to,
    subject: "Welcome to Coverboard",
    html: base(`
      <h2 style="margin:0 0 12px">Your trial has ended — welcome aboard</h2>
      <p>Your ${planName} plan is now active. Thank you for choosing Coverboard.</p>
      <p><a href="${APP_URL}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open dashboard</a></p>
    `),
  });
}

export async function emailAccountPaused({ to, daysUntilDeletion }: { to: string; daysUntilDeletion: number }) {
  await sendEmail({
    to,
    subject: "Your Coverboard trial has ended",
    html: base(`
      <h2 style="margin:0 0 12px">Your trial has ended</h2>
      <p>Your account is paused. You have <strong>${daysUntilDeletion} days</strong>
      to add payment details before your data is permanently deleted.</p>
      <p><a href="${APP_URL}/settings/billing/add-payment" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Reactivate now</a></p>
    `),
  });
}

export async function emailDeletionScheduled({
  to,
  scheduledFor,
  reason,
}: {
  to: string;
  scheduledFor: Date;
  reason: string;
}) {
  const when = scheduledFor.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  await sendEmail({
    to,
    subject: "Your Coverboard data will be deleted on " + when,
    html: base(`
      <h2 style="margin:0 0 12px">Data deletion scheduled</h2>
      <p>Your Coverboard account and all associated data will be permanently
      deleted on <strong>${when}</strong> (${reason.replace(/_/g, " ")}).</p>
      <p>To keep your data, reactivate your subscription before that date.
      Once deletion runs, recovery is not possible.</p>
      <p><a href="${APP_URL}/settings/billing/add-payment" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Reactivate and keep my data</a></p>
    `),
  });
}

export async function emailDeletionCanceled({ to }: { to: string }) {
  await sendEmail({
    to,
    subject: "Your Coverboard data deletion was canceled",
    html: base(`
      <h2 style="margin:0 0 12px">Deletion canceled</h2>
      <p>Your scheduled data deletion has been canceled and your account is
      fully active. Welcome back.</p>
      <p><a href="${APP_URL}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open dashboard</a></p>
    `),
  });
}

export async function emailDeletionComplete({
  to,
  organizationName,
}: {
  to: string;
  organizationName: string;
}) {
  await sendEmail({
    to,
    subject: "Your Coverboard data has been deleted",
    html: base(`
      <h2 style="margin:0 0 12px">Data deletion complete</h2>
      <p>The Coverboard account for <strong>${organizationName}</strong> has
      been permanently deleted. All team data, leave records, and billing
      information have been removed in line with GDPR requirements.</p>
      <p>A record of this deletion is retained for regulatory purposes but no
      user or business data remains.</p>
      <p>If you&apos;d like to start again, you can create a new account at any
      time.</p>
      <p><a href="${APP_URL}/signup" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Create a new account</a></p>
    `),
  });
}

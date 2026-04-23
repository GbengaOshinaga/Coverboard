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

export async function emailAccountPaused({ to }: { to: string }) {
  await sendEmail({
    to,
    subject: "Your Coverboard trial has ended",
    html: base(`
      <h2 style="margin:0 0 12px">Your trial has ended</h2>
      <p>Your account is paused. Add your payment details to reactivate — your
      data is safe and nothing has been deleted.</p>
      <p><a href="${APP_URL}/settings/billing/add-payment" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Reactivate now</a></p>
    `),
  });
}

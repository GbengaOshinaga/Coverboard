/**
 * Founder outreach email — sent at most once per organisation, capped at the
 * first N verified signups across the whole instance. Triggered when a new
 * admin verifies their email so we don't reach out to typo signups.
 *
 * Configuration (all optional, sensible defaults):
 *   FOUNDER_OUTREACH_CAP   max number of orgs to email (default 100)
 *   FOUNDER_FROM           "From" header (default "Coverboard Founder <hello@coverboard.io>")
 *   FOUNDER_REPLY_TO       "Reply-To" address (default "hello@coverboard.io")
 *   FOUNDER_NAME           Signed-by name (default "Gbenga")
 *
 * Set FOUNDER_OUTREACH_CAP=0 to disable entirely (useful for staging /
 * preview environments where you don't want to email yourself every time
 * you create a test org).
 */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { founderOutreachEmail } from "@/lib/email-templates";

const DEFAULT_CAP = 100;
const DEFAULT_FROM = "Coverboard Founder <hello@coverboard.io>";
const DEFAULT_REPLY_TO = "hello@coverboard.io";
const DEFAULT_NAME = "Gbenga";

function parseCap(): number {
  const raw = process.env.FOUNDER_OUTREACH_CAP;
  if (raw === undefined || raw === "") return DEFAULT_CAP;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CAP;
  return n;
}

function firstNameFrom(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

/**
 * Attempts to send the founder outreach email for `userId`. No-ops silently
 * when any of the gating conditions fail:
 *   - the user isn't an ADMIN of their org (only the signup admin counts)
 *   - the org has already received the email
 *   - the global cap has been reached
 *   - FOUNDER_OUTREACH_CAP is 0
 *
 * Fire-and-forget. Never throws — verification flow must not fail because
 * this opportunistic send hit a transient error.
 */
export async function maybeSendFounderEmail(userId: string): Promise<void> {
  try {
    const cap = parseCap();
    if (cap === 0) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organization: {
          select: { id: true, founderEmailSentAt: true },
        },
      },
    });
    if (!user || !user.organization) return;
    if (user.role !== "ADMIN") return;
    if (user.organization.founderEmailSentAt !== null) return;

    const alreadySent = await prisma.organization.count({
      where: { founderEmailSentAt: { not: null } },
    });
    if (alreadySent >= cap) return;

    // Reserve the slot before sending to make double-sends impossible if a
    // user clicks the verification link twice in quick succession. The
    // updateMany guard turns the read+write into an effective CAS — only
    // the first concurrent writer will get the rows-affected=1 result.
    const reservation = await prisma.organization.updateMany({
      where: { id: user.organization.id, founderEmailSentAt: null },
      data: { founderEmailSentAt: new Date() },
    });
    if (reservation.count === 0) return;

    const founderName = process.env.FOUNDER_NAME ?? DEFAULT_NAME;
    const fromAddress = process.env.FOUNDER_FROM ?? DEFAULT_FROM;
    const replyTo = process.env.FOUNDER_REPLY_TO ?? DEFAULT_REPLY_TO;

    const { subject, html } = founderOutreachEmail({
      firstName: firstNameFrom(user.name),
      founderName,
      replyAddress: replyTo,
    });

    await sendEmail({
      to: user.email,
      subject,
      html,
      from: fromAddress,
      replyTo,
    });
  } catch (err) {
    console.error("Founder outreach send failed:", err);
  }
}

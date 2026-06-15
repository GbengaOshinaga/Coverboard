import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { fitNoteAlertEmail } from "@/lib/email-templates";
import { verifyCronAuth } from "@/lib/cron-auth";
import { selectOverdueFitNotes } from "@/lib/fit-note-alerts";
import { hasFeatureForEnum } from "@/lib/planFeatures";

/**
 * Weekly fit-note alerts cron — Growth tier feature.
 *
 * Runs Monday mornings (after the 08:00 weekly digest). For each
 * Growth-or-higher org, finds approved sickness leaves that have run past
 * day 7 without an `evidenceProvided` flag and emails the org's admins +
 * managers a summary so they can chase the missing fit notes.
 *
 * Stateless: re-runs each week with no per-leave bookkeeping. If a leave
 * stays overdue, the admin keeps receiving weekly reminders until they
 * record evidence on the request. That cadence is gentle enough that it
 * doesn't feel like spam and avoids a schema change for `lastAlertedAt`.
 */

export const runtime = "nodejs";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

async function runFitNoteAlerts(now: Date): Promise<{
  organisationsScanned: number;
  emailsSent: number;
  flaggedLeaves: number;
}> {
  // Only Growth+ orgs advertise fit-note tracking. Restrict the query so we
  // never email a Free/Starter org about a feature they don't have.
  const orgs = await prisma.organization.findMany({
    where: {
      onboardingCompleted: true,
      plan: { in: ["TRIAL", "GROWTH", "SCALE", "PRO"] },
    },
    select: { id: true, name: true, plan: true },
  });

  let emailsSent = 0;
  let flaggedLeaves = 0;

  for (const org of orgs) {
    // Belt-and-braces — the WHERE clause above should already filter, but
    // gate again on the plan feature flag so any future plan reshuffle
    // doesn't silently break the contract.
    if (!hasFeatureForEnum(org.plan, "ssp_tracking")) continue;

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        user: { organizationId: org.id },
        status: "APPROVED",
        evidenceProvided: false,
        // Pre-filter on the date side cheaply; the helper does the
        // calendar-day math and applies the "still active or recently
        // ended" rule.
        startDate: {
          lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        evidenceProvided: true,
        user: { select: { id: true, name: true, email: true } },
        leaveType: { select: { name: true } },
      },
    });

    const overdue = selectOverdueFitNotes(leaves, now);
    if (overdue.length === 0) continue;
    flaggedLeaves += overdue.length;

    const recipients = await prisma.user.findMany({
      where: {
        organizationId: org.id,
        role: { in: ["ADMIN", "MANAGER"] },
      },
      select: { name: true, email: true },
    });

    for (const recipient of recipients) {
      const { subject, html } = fitNoteAlertEmail({
        recipientName: recipient.name,
        orgName: org.name,
        items: overdue.map((o) => ({
          userName: o.userName,
          leaveTypeName: o.leaveTypeName,
          startDate: o.startDate,
          endDate: o.endDate,
          daysElapsed: o.daysElapsed,
        })),
        dashboardUrl: `${BASE_URL}/dashboard`,
      });

      sendEmail({ to: recipient.email, subject, html }).catch((err) =>
        console.error(
          `Fit note alert email failed for ${recipient.email}:`,
          err
        )
      );
      emailsSent++;
    }
  }

  return {
    organisationsScanned: orgs.length,
    emailsSent,
    flaggedLeaves,
  };
}

export async function POST(request: Request) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await runFitNoteAlerts(new Date());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Fit note alerts cron failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Vercel cron triggers send GET by default.
export async function GET(request: Request) {
  return POST(request);
}

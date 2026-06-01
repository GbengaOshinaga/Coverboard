import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { monthlyComplianceReportEmail } from "@/lib/email-templates";
import { verifyCronAuth } from "@/lib/cron-auth";
import { buildComplianceSnapshot } from "@/lib/monthly-compliance-snapshot";
import { hasFeatureForEnum } from "@/lib/planFeatures";

/**
 * Monthly compliance snapshot — Scale tier feature.
 *
 * Fires on the 1st of each month at 09:00 UTC. For each Scale-or-higher
 * org, builds a small compliance summary (workforce, leaves this month,
 * Bradford alerts, parental, right-to-work) and emails admins + managers
 * with a CTA to the full dashboard report.
 *
 * The aggregation logic lives in `monthly-compliance-snapshot.ts` so it
 * can be unit-tested without a DB; this route owns the prisma queries
 * and email dispatch.
 */

export const runtime = "nodejs";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

const MONTH_FMT = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function endOfMonth(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1
  );
}

async function runMonthlyReport(now: Date): Promise<{
  organisationsScanned: number;
  emailsSent: number;
}> {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthLabel = MONTH_FMT.format(monthStart);

  const orgs = await prisma.organization.findMany({
    where: {
      onboardingCompleted: true,
      plan: { in: ["TRIAL", "SCALE", "PRO"] },
    },
    select: { id: true, name: true, plan: true },
  });

  let emailsSent = 0;

  for (const org of orgs) {
    // Belt-and-braces: gate again on the feature flag so a future plan
    // reshuffle can't silently start sending these to lower tiers.
    if (!hasFeatureForEnum(org.plan, "compliance_reports")) continue;

    const [
      activeUkEmployees,
      leavesThisMonth,
      bradfordRows,
      parentalLeaves,
      rtwUnverified,
      recipients,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          organizationId: org.id,
          isActive: true,
          workCountry: "GB",
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          user: { organizationId: org.id },
          status: "APPROVED",
          // Touched the month: started before month-end AND ended after
          // month-start.
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        select: { leaveType: { select: { name: true } } },
      }),
      prisma.user.findMany({
        where: {
          organizationId: org.id,
          isActive: true,
          workCountry: "GB",
          bradfordScore: { gt: 0 },
        },
        select: { id: true, name: true, bradfordScore: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          user: { organizationId: org.id },
          status: "APPROVED",
          endDate: { gte: now },
          leaveType: {
            name: {
              in: [
                "Statutory Maternity Leave",
                "Statutory Paternity Leave",
                "Shared Parental Leave (SPL)",
                "Adoption Leave",
              ],
            },
          },
        },
        select: {
          startDate: true,
          endDate: true,
          user: { select: { id: true, name: true } },
          leaveType: { select: { name: true } },
        },
      }),
      prisma.user.findMany({
        where: {
          organizationId: org.id,
          isActive: true,
          workCountry: "GB",
          // null means "not yet reviewed"; false means "explicitly not
          // verified". Both belong in the unverified bucket for the email.
          OR: [{ rightToWorkVerified: null }, { rightToWorkVerified: false }],
        },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: {
          organizationId: org.id,
          role: { in: ["ADMIN", "MANAGER"] },
        },
        select: { name: true, email: true },
      }),
    ]);

    if (recipients.length === 0) continue;

    const snapshot = buildComplianceSnapshot(
      {
        activeUkEmployees,
        leavesThisMonth: leavesThisMonth.map((l) => ({
          leaveTypeName: l.leaveType.name,
        })),
        bradfordScores: bradfordRows.map((u) => ({
          userId: u.id,
          name: u.name,
          score: u.bradfordScore,
        })),
        parentalLeavesActive: parentalLeaves.map((p) => ({
          userId: p.user.id,
          name: p.user.name,
          leaveTypeName: p.leaveType.name,
          endDate: p.endDate,
        })),
        rightToWorkUnverified: rtwUnverified.map((u) => ({
          userId: u.id,
          name: u.name,
        })),
      },
      { now }
    );

    for (const recipient of recipients) {
      const { subject, html } = monthlyComplianceReportEmail({
        recipientName: recipient.name,
        orgName: org.name,
        monthLabel,
        reportUrl: `${BASE_URL}/reports`,
        activeUkEmployees: snapshot.activeUkEmployees,
        leavesThisMonth: snapshot.leavesThisMonth,
        bradfordAlerts: snapshot.bradfordAlerts.map((b) => ({
          name: b.name,
          score: Math.round(b.score),
        })),
        parentalActive: snapshot.parentalActive,
        parentalReturningSoon: snapshot.parentalReturningSoon.map((p) => ({
          name: p.name,
          leaveTypeName: p.leaveTypeName,
          endDate: p.endDate,
        })),
        rightToWorkUnverifiedCount: snapshot.rightToWorkUnverifiedCount,
        rightToWorkUnverifiedSample: snapshot.rightToWorkUnverifiedSample,
        isAllClear: snapshot.isAllClear,
      });

      sendEmail({ to: recipient.email, subject, html }).catch((err) =>
        console.error(
          `Monthly compliance email failed for ${recipient.email}:`,
          err
        )
      );
      emailsSent++;
    }
  }

  return {
    organisationsScanned: orgs.length,
    emailsSent,
  };
}

export async function POST(request: Request) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await runMonthlyReport(new Date());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Monthly compliance report cron failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}

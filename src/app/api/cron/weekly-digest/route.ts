import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { weeklyDigestEmail } from "@/lib/email-templates";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 4);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatWeekLabel(monday: Date): string {
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${monday.toLocaleDateString("en-US", opts)} – ${friday.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const thisMonday = startOfWeek(now);
    const thisFriday = endOfWeek(now);
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    const nextFriday = new Date(nextMonday);
    nextFriday.setDate(nextFriday.getDate() + 4);
    nextFriday.setHours(23, 59, 59, 999);

    const weekLabel = formatWeekLabel(thisMonday);

    const orgs = await prisma.organization.findMany({
      where: { onboardingCompleted: true },
      select: { id: true, name: true },
    });

    let totalSent = 0;

    for (const org of orgs) {
      const [outThisWeek, outNextWeek, pendingRequests, recipients] = await Promise.all([
        prisma.leaveRequest.findMany({
          where: {
            user: { organizationId: org.id },
            status: "APPROVED",
            startDate: { lte: thisFriday },
            endDate: { gte: thisMonday },
          },
          include: {
            user: { select: { name: true } },
            leaveType: { select: { name: true, color: true } },
          },
          orderBy: { startDate: "asc" },
        }),
        prisma.leaveRequest.findMany({
          where: {
            user: { organizationId: org.id },
            status: "APPROVED",
            startDate: { lte: nextFriday },
            endDate: { gte: nextMonday },
          },
          include: {
            user: { select: { name: true } },
            leaveType: { select: { name: true, color: true } },
          },
          orderBy: { startDate: "asc" },
        }),
        prisma.leaveRequest.count({
          where: {
            user: { organizationId: org.id },
            status: "PENDING",
          },
        }),
        prisma.user.findMany({
          where: {
            organizationId: org.id,
            role: { in: ["ADMIN", "MANAGER"] },
            digestOptOut: false,
          },
          select: { name: true, email: true },
        }),
      ]);

      if (recipients.length === 0) continue;

      const thisWeekAbsences = outThisWeek.map((r) => ({
        name: r.user.name,
        leaveType: r.leaveType.name,
        leaveColor: r.leaveType.color,
        startDate: r.startDate,
        endDate: r.endDate,
      }));

      const nextWeekAbsences = outNextWeek.map((r) => ({
        name: r.user.name,
        leaveType: r.leaveType.name,
        leaveColor: r.leaveType.color,
        startDate: r.startDate,
        endDate: r.endDate,
      }));

      for (const recipient of recipients) {
        const { subject, html } = weeklyDigestEmail({
          recipientName: recipient.name,
          orgName: org.name,
          weekLabel,
          outThisWeek: thisWeekAbsences,
          outNextWeek: nextWeekAbsences,
          pendingCount: pendingRequests,
          dashboardUrl: `${BASE_URL}/dashboard`,
        });

        sendEmail({ to: recipient.email, subject, html }).catch((err) =>
          console.error(`Digest email error for ${recipient.email}:`, err)
        );
        totalSent++;
      }
    }

    return NextResponse.json({
      success: true,
      organizations: orgs.length,
      emailsSent: totalSent,
    });
  } catch (error) {
    console.error("Weekly digest error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

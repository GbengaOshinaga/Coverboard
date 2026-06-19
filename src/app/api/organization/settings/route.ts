import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasUKEmployees } from "@/lib/uk-workforce";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  ukBankHolidayInclusive: z.boolean().optional(),
  ukBankHolidayRegion: z.enum(["ENGLAND_WALES", "SCOTLAND", "NORTHERN_IRELAND"]).optional(),
  ukCarryOverEnabled: z.boolean().optional(),
  ukCarryOverMax: z.number().int().min(0).max(8).optional(),
  ukCarryOverExpiryMonth: z.number().int().min(1).max(12).optional(),
  ukCarryOverExpiryDay: z.number().int().min(1).max(31).optional(),
  regionsEnabled: z.boolean().optional(),
  industry: z.string().max(80).nullable().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const userId = (session.user as Record<string, unknown>).id as string;
  const [
    settings,
    hasUkEmployeesFlag,
    missingWorkLocationCount,
    otherApproverCount,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        ukBankHolidayInclusive: true,
        ukBankHolidayRegion: true,
        ukCarryOverEnabled: true,
        ukCarryOverMax: true,
        ukCarryOverExpiryMonth: true,
        ukCarryOverExpiryDay: true,
        dataResidency: true,
        maxAdminUsers: true,
        plan: true,
        regionsEnabled: true,
        industry: true,
        deletionScheduledFor: true,
      },
    }),
    hasUKEmployees(orgId),
    prisma.user.count({
      where: { organizationId: orgId, isActive: true, workCountry: null },
    }),
    // Mirrors the self-approval guard in /api/leave-requests/[id]: when no other
    // admin/manager exists, the lone approver may approve their own requests.
    prisma.user.count({
      where: {
        organizationId: orgId,
        id: { not: userId },
        role: { in: ["ADMIN", "MANAGER"] },
      },
    }),
  ]);
  return NextResponse.json({
    ...settings,
    hasUkEmployees: hasUkEmployeesFlag,
    missingWorkLocationCount,
    soleApprover: otherApproverCount === 0,
  });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userRole = (session.user as Record<string, unknown>).role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  if ("dataResidency" in body) {
    return NextResponse.json(
      { error: "Data residency is read-only. Changes require a manual review." },
      { status: 400 }
    );
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const data = parsed.data;

  if (data.ukCarryOverEnabled === false) {
    data.ukCarryOverMax = 0;
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data,
    select: {
      id: true,
      ukBankHolidayInclusive: true,
      ukBankHolidayRegion: true,
      ukCarryOverEnabled: true,
      ukCarryOverMax: true,
      ukCarryOverExpiryMonth: true,
      ukCarryOverExpiryDay: true,
      dataResidency: true,
      maxAdminUsers: true,
      plan: true,
      regionsEnabled: true,
      industry: true,
    },
  });

  // Carry-over expiry is an org-wide policy, not a per-employee value. If the
  // admin changes the expiry month/day, re-stamp existing carry-over rows that
  // haven't expired yet so live balances follow the new policy instead of a
  // stale date. Already-expired rows are left alone — we never resurrect days
  // that have already lapsed.
  if (
    data.ukCarryOverExpiryMonth !== undefined ||
    data.ukCarryOverExpiryDay !== undefined
  ) {
    const now = new Date();
    const liveYears = await prisma.leaveCarryOverBalance.findMany({
      where: { user: { organizationId: orgId }, expiresAt: { gt: now } },
      select: { leaveYear: true },
      distinct: ["leaveYear"],
    });
    for (const { leaveYear } of liveYears) {
      // Matches the expiry computation in /api/carry-over/process (leaveYear
      // there is fromYear + 1).
      const newExpiry = new Date(
        leaveYear,
        updated.ukCarryOverExpiryMonth - 1,
        updated.ukCarryOverExpiryDay,
        23,
        59,
        59,
        999
      );
      await prisma.leaveCarryOverBalance.updateMany({
        where: {
          user: { organizationId: orgId },
          leaveYear,
          expiresAt: { gt: now },
        },
        data: { expiresAt: newExpiry },
      });
    }
  }

  recordAudit({
    organizationId: orgId,
    action: "organization.settings_updated",
    resource: "organization",
    resourceId: orgId,
    actor: {
      id: (session.user as Record<string, unknown>).id as string,
      email: session.user.email ?? null,
      role: userRole,
    },
    metadata: { changes: data },
    context: requestAuditContext(request),
  });

  return NextResponse.json(updated);
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserLeaveBalances } from "@/lib/leave-balances";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { z } from "zod";

const bodySchema = z.object({
  fromYear: z.number().int().min(2020).max(2100),
  dryRun: z.boolean().optional(),
});

/**
 * Year-end carry-over rollover. For every UK user in the org, find their
 * Annual Leave balance for `fromYear`, calculate unused days, cap at
 * `ukCarryOverMax`, and create a `LeaveCarryOverBalance` for `fromYear + 1`
 * with the org-configured expiry date.
 *
 * Does nothing if `ukCarryOverEnabled` is false. Idempotent: re-running
 * upserts the same balance row.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can run year-end rollover" },
      { status: 403 }
    );
  }

  const orgId = sessionUser.organizationId as string;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { fromYear, dryRun } = parsed;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      ukCarryOverEnabled: true,
      ukCarryOverMax: true,
      ukCarryOverExpiryMonth: true,
      ukCarryOverExpiryDay: true,
    },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (!org.ukCarryOverEnabled || org.ukCarryOverMax <= 0) {
    return NextResponse.json(
      { error: "Carry-over is not enabled. Configure it in Settings first." },
      { status: 400 }
    );
  }

  const ukUsers = await prisma.user.findMany({
    where: { organizationId: orgId, countryCode: "GB" },
    select: { id: true, name: true, email: true },
  });

  const expiresAt = new Date(
    fromYear + 1,
    org.ukCarryOverExpiryMonth - 1,
    org.ukCarryOverExpiryDay,
    23,
    59,
    59,
    999
  );

  const summary: Array<{
    userId: string;
    name: string;
    email: string;
    leaveTypeId: string;
    leaveTypeName: string;
    unusedDays: number;
    daysCarried: number;
  }> = [];

  for (const user of ukUsers) {
    let balances;
    try {
      balances = await getUserLeaveBalances(user.id, fromYear);
    } catch {
      continue;
    }

    const annualLeave = balances.find((b) => b.leaveTypeName === "Annual Leave");
    if (!annualLeave) continue;

    const baseAllowance = annualLeave.allowance - annualLeave.carryOver.remaining;
    const unusedDays = Math.max(0, baseAllowance - annualLeave.used);
    const daysCarried = Math.min(unusedDays, org.ukCarryOverMax);

    if (daysCarried <= 0) continue;

    summary.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      leaveTypeId: annualLeave.leaveTypeId,
      leaveTypeName: annualLeave.leaveTypeName,
      unusedDays,
      daysCarried,
    });

    if (!dryRun) {
      await prisma.leaveCarryOverBalance.upsert({
        where: {
          userId_leaveTypeId_leaveYear: {
            userId: user.id,
            leaveTypeId: annualLeave.leaveTypeId,
            leaveYear: fromYear + 1,
          },
        },
        update: {
          daysCarried,
          daysRemaining: daysCarried,
          expiresAt,
        },
        create: {
          userId: user.id,
          leaveTypeId: annualLeave.leaveTypeId,
          leaveYear: fromYear + 1,
          daysCarried,
          daysRemaining: daysCarried,
          expiresAt,
        },
      });
    }
  }

  if (!dryRun) {
    recordAudit({
      organizationId: orgId,
      action: "carry_over.rollover_run",
      resource: "carry_over",
      resourceId: null,
      actor: {
        id: sessionUser.id as string,
        email: session.user.email ?? null,
        role: userRole,
      },
      metadata: {
        fromYear,
        toYear: fromYear + 1,
        processed: summary.length,
        expiresAt: expiresAt.toISOString(),
      },
      context: requestAuditContext(request),
    });
  }

  return NextResponse.json({
    fromYear,
    toYear: fromYear + 1,
    expiresAt: expiresAt.toISOString(),
    dryRun: !!dryRun,
    processed: summary.length,
    summary,
  });
}

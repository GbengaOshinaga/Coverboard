import { NextResponse } from "next/server";
import { dbDate, endWorkPatternOps, ukToday } from "@/lib/workPattern";
import { qualifyingDaysFor } from "@/lib/working-week-server";
import { recomputeCurrentSspSpells } from "@/lib/leave-requests/ssp-spell";
import { ftesFor } from "@/lib/fte-server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, recordReadAudit, requestAuditContext } from "@/lib/audit";
import type { AnyPlan } from "@/lib/plans";
import { maxAdminsForPlan } from "@/lib/plans";
import {
  EMPLOYMENT_TYPES,
  normalizeEmploymentType,
} from "@/lib/employment-types";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  memberType: z.enum(["EMPLOYEE", "CONTRACTOR", "FREELANCER"]).optional(),
  employmentType: z
    .preprocess(normalizeEmploymentType, z.enum(EMPLOYMENT_TYPES))
    .optional(),
  daysWorkedPerWeek: z.number().min(0).max(7).optional(),
  fteRatio: z.number().min(0).max(1).optional(),
  rightToWorkVerified: z.boolean().nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  countryCode: z.string().min(2).max(2).optional(),
  workCountry: z.string().trim().toUpperCase().length(2).nullable().optional(),
  serviceStartDate: z
    .string()
    .date()
    .transform((s) => new Date(s))
    .nullable()
    .optional(),
}).transform((data) =>
  data.employmentType === "ZERO_HOURS"
    ? { ...data, daysWorkedPerWeek: 0 }
    : data
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  const orgId = sessionUser.organizationId as string;

  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const member = await prisma.user.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      memberType: true,
      employmentType: true,
      daysWorkedPerWeek: true,
      fteRatio: true,
      qualifyingDaysPerWeek: true,
      averageWeeklyEarnings: true,
      rightToWorkVerified: true,
      department: true,
      countryCode: true,
      workCountry: true,
      isActive: true,
      leftOn: true,
      serviceStartDate: true,
      bradfordScore: true,
      createdAt: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Pro-only read-side audit: log who opened this employee profile.
  if ((sessionUser.id as string) !== id) {
    void recordReadAudit({
      plan: sessionUser.plan as AnyPlan | undefined,
      organizationId: orgId,
      action: "team_member.viewed",
      resource: "team_member",
      resourceId: id,
      actor: {
        id: sessionUser.id as string,
        email: (session.user.email as string | null) ?? null,
        role: userRole,
      },
      metadata: { subjectEmail: member.email },
      context: requestAuditContext(request),
    });
  }

  const fte = (await ftesFor(orgId, [member])).get(member.id);
  return NextResponse.json({ ...member, fte });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    if (parsed.data.role === "ADMIN") {
      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: { organizationId: true, role: true },
      });

      if (targetUser && targetUser.role !== "ADMIN") {
        const [org, adminCount] = await Promise.all([
          prisma.organization.findUnique({
            where: { id: targetUser.organizationId },
            select: { plan: true },
          }),
          prisma.user.count({
            where: { organizationId: targetUser.organizationId, role: "ADMIN" },
          }),
        ]);

        const maxAdmins = maxAdminsForPlan(org?.plan);
        if (org && Number.isFinite(maxAdmins) && adminCount >= maxAdmins) {
          return NextResponse.json(
            {
              error: `Your plan allows up to ${maxAdmins} admin user${
                maxAdmins === 1 ? "" : "s"
              }. Please upgrade or change an existing admin's role first.`,
            },
            { status: 403 }
          );
        }
      }
    }

    const previous = await prisma.user.findUnique({
      where: { id },
      select: { role: true, organizationId: true },
    });

    const member = await prisma.user.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(parsed.data.daysWorkedPerWeek !== undefined
          ? { qualifyingDaysPerWeek: qualifyingDaysFor(parsed.data.daysWorkedPerWeek) }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        memberType: true,
        employmentType: true,
        daysWorkedPerWeek: true,
        fteRatio: true,
        rightToWorkVerified: true,
        department: true,
        countryCode: true,
        workCountry: true,
        organizationId: true,
      },
    });

    // Without a working pattern, days worked decides which days SSP is paid
    // on; recalculate sickness still going on or still to come.
    if (parsed.data.daysWorkedPerWeek !== undefined) {
      await recomputeCurrentSspSpells(id);
    }

    if (previous && previous.organizationId === member.organizationId) {
      const actor = {
        id: sessionUser.id as string,
        email: session.user.email ?? null,
        role: userRole,
      };
      const ctx = requestAuditContext(request);
      if (parsed.data.role && previous.role !== parsed.data.role) {
        recordAudit({
          organizationId: member.organizationId,
          action: "team_member.role_changed",
          resource: "team_member",
          resourceId: id,
          actor,
          metadata: {
            email: member.email,
            from: previous.role,
            to: parsed.data.role,
          },
          context: ctx,
        });
      }
      recordAudit({
        organizationId: member.organizationId,
        action: "team_member.updated",
        resource: "team_member",
        resourceId: id,
        actor,
        metadata: { email: member.email, changes: Object.keys(parsed.data) },
        context: ctx,
      });
    }

    const { organizationId: _org, ...rest } = member;
    return NextResponse.json(rest);
  } catch (error) {
    console.error("Update team member error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Someone leaving: marked as left, not deleted. Holiday records (leave,
 * carry-over, holiday pay) must be kept for 6 years from when they were made
 * (Employment Rights Act 2025, from 6 April 2026), so their history stays.
 * They can't sign in, they're off the team list, their working pattern ends
 * after today, their future leave and cover are cancelled (so the cover shows
 * short again), and data retention removes them 6 years after leaving.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can mark someone as having left" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const userId = sessionUser.id as string;
  const orgId = sessionUser.organizationId as string;

  if (id === userId) {
    return NextResponse.json(
      { error: "You can't mark yourself as having left" },
      { status: 400 }
    );
  }

  try {
    // Only people in your own team.
    const target = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: { email: true, name: true, isActive: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    if (!target.isActive) {
      return NextResponse.json({ error: `${target.name} has already left` }, { status: 409 });
    }

    const today = ukToday();
    const lastDay = dbDate(today);
    const dayAfter = new Date(lastDay.getTime() + 24 * 60 * 60 * 1000);
    const [, , cancelledLeave, cancelledCover] = await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { isActive: false, leftOn: lastDay } }),
      // Patterns run to today; cover from tomorrow no longer counts them.
      ...endWorkPatternOps(id, dayAfter),
      prisma.leaveRequest.updateMany({
        where: { userId: id, status: { in: ["PENDING", "APPROVED"] }, startDate: { gt: lastDay } },
        data: { status: "CANCELLED" },
      }),
      prisma.coverOffer.updateMany({
        where: { userId: id, status: { in: ["PENDING", "ACCEPTED"] }, date: { gt: lastDay } },
        data: { status: "WITHDRAWN" },
      }),
    ]);

    recordAudit({
      organizationId: orgId,
      action: "team_member.deleted",
      resource: "team_member",
      resourceId: id,
      actor: {
        id: userId,
        email: session.user.email ?? null,
        role: userRole,
      },
      metadata: {
        event: "team_member.left",
        name: target.name,
        email: target.email,
        leftOn: today,
        futureLeaveCancelled: cancelledLeave.count,
        futureCoverWithdrawn: cancelledCover.count,
      },
      context: requestAuditContext(request),
    });

    return NextResponse.json({ success: true, leftOn: today });
  } catch (error) {
    console.error("Mark as left error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

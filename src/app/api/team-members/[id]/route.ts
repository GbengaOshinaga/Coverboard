import { NextResponse } from "next/server";
import { sessionHasFeature } from "@/lib/plan-gate";
import { ukToday } from "@/lib/workPattern";
import { leavingDateError, recordLeaving } from "@/lib/leavers";
import { getWorkingWeek, qualifyingDaysFor, syncDaysFromPattern } from "@/lib/working-week-server";
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
  /** Written opt-out of the 48-hour average: signed on / until (null clears). */
  workingTimeOptOutFrom: z.string().date().transform((s) => new Date(`${s}T00:00:00Z`)).nullable().optional(),
  workingTimeOptOutUntil: z.string().date().transform((s) => new Date(`${s}T00:00:00Z`)).nullable().optional(),
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
      workingTimeOptOutFrom: true,
      workingTimeOptOutUntil: true,
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

  // Days per week come from their working pattern when they have one. The
  // stored count can lag (a pattern saved before it was kept in step, or one
  // that started later): correct it here so every screen agrees.
  const week = await getWorkingWeek(member.id);
  const fromPattern = week.weekdays !== null;
  if (fromPattern && member.daysWorkedPerWeek !== week.daysPerWeek) {
    await syncDaysFromPattern(member.id);
  }
  return NextResponse.json({
    ...member,
    // The Bradford Factor is a Growth feature.
    bradfordScore: sessionHasFeature(sessionUser, "bradford_factor") ? member.bradfordScore : 0,
    // Earnings are a Growth feature (earnings history and statutory pay).
    averageWeeklyEarnings: sessionHasFeature(sessionUser, "earnings_history") ? member.averageWeeklyEarnings : null,
    rightToWorkVerified: sessionHasFeature(sessionUser, "right_to_work") ? member.rightToWorkVerified : null,
    daysWorkedPerWeek: fromPattern ? week.daysPerWeek : member.daysWorkedPerWeek,
    daysFromPattern: fromPattern,
    fte,
  });
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

    // Only people in the caller's own organisation.
    const inOrg = await prisma.user.findFirst({
      where: { id, organizationId: sessionUser.organizationId as string },
      select: { id: true, role: true },
    });
    if (!inOrg) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Only admins change roles (a manager could otherwise make themselves admin).
    if (parsed.data.role !== undefined && parsed.data.role !== inOrg.role && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only an admin can change someone's role." }, { status: 403 });
    }

    // Never leave the team without an admin.
    if (inOrg.role === "ADMIN" && parsed.data.role !== undefined && parsed.data.role !== "ADMIN") {
      const admins = await prisma.user.count({
        where: { organizationId: sessionUser.organizationId as string, role: "ADMIN", isActive: true },
      });
      if (admins <= 1) {
        return NextResponse.json(
          { error: "This is the team's only admin. Make someone else an admin first." },
          { status: 409 }
        );
      }
    }

    // Right-to-work status is a Growth feature; on lower plans it isn't changed.
    if (!sessionHasFeature(sessionUser, "right_to_work")) {
      delete parsed.data.rightToWorkVerified;
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
 * Someone leaving (last day today, in the past, or ahead while they work
 * their notice; src/lib/leavers.ts): marked as left, not deleted. Holiday records (leave,
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

  // Their last day: today unless given (past = recorded late, future =
  // working their notice; src/lib/leavers.ts).
  const body = await request.json().catch(() => ({}));
  const today = ukToday();
  const lastDay: string = typeof body?.lastDay === "string" && body.lastDay ? body.lastDay : today;

  try {
    // Only people in your own team.
    const target = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: { email: true, name: true, isActive: true, serviceStartDate: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    if (!target.isActive) {
      return NextResponse.json({ error: `${target.name} has already left` }, { status: 409 });
    }
    const dateProblem = leavingDateError({ lastDay, today, serviceStartDate: target.serviceStartDate });
    if (dateProblem) return NextResponse.json({ error: dateProblem }, { status: 400 });

    const result = await recordLeaving({ userId: id, lastDay, today });

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
        event: result.leftNow ? "team_member.left" : "team_member.leaving_date_set",
        name: target.name,
        email: target.email,
        leftOn: lastDay,
        futureLeaveCancelled: result.futureLeaveCancelled,
        futureCoverWithdrawn: result.futureCoverWithdrawn,
        leaveCutShort: result.leaveCutShort,
      },
      context: requestAuditContext(request),
    });

    return NextResponse.json({ success: true, leftOn: lastDay, ...result });
  } catch (error) {
    console.error("Mark as left error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

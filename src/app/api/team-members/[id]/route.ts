import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, requestAuditContext } from "@/lib/audit";
import { hasFeatureForEnum } from "@/lib/planFeatures";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  memberType: z.enum(["EMPLOYEE", "CONTRACTOR", "FREELANCER"]).optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "VARIABLE_HOURS"]).optional(),
  daysWorkedPerWeek: z.number().min(0).max(7).optional(),
  fteRatio: z.number().min(0).max(1).optional(),
  rightToWorkVerified: z.boolean().nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  countryCode: z.string().min(2).max(2).optional(),
  workCountry: z.string().trim().toUpperCase().length(2).nullable().optional(),
});

export async function GET(
  _request: Request,
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
      serviceStartDate: true,
      bradfordScore: true,
      createdAt: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json(member);
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
            select: { maxAdminUsers: true, plan: true },
          }),
          prisma.user.count({
            where: { organizationId: targetUser.organizationId, role: "ADMIN" },
          }),
        ]);

        const unlimitedAdminsPlan = hasFeatureForEnum(org?.plan, "unlimited_admins");
        if (
          org &&
          !unlimitedAdminsPlan &&
          org.maxAdminUsers > 0 &&
          adminCount >= org.maxAdminUsers
        ) {
          return NextResponse.json(
            {
              error: `Your plan allows up to ${org.maxAdminUsers} admin users. Please upgrade or change an existing admin's role first.`,
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
      data: parsed.data,
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
      { error: "Only admins can remove team members" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const userId = sessionUser.id as string;

  if (id === userId) {
    return NextResponse.json(
      { error: "You cannot remove yourself" },
      { status: 400 }
    );
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { email: true, name: true, organizationId: true },
    });
    await prisma.user.delete({ where: { id } });

    if (target) {
      recordAudit({
        organizationId: target.organizationId,
        action: "team_member.deleted",
        resource: "team_member",
        resourceId: id,
        actor: {
          id: userId,
          email: session.user.email ?? null,
          role: userRole,
        },
        metadata: { name: target.name, email: target.email },
        context: requestAuditContext(request),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete team member error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

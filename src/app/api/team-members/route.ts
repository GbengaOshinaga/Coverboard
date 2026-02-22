import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { teamMemberSchema } from "@/lib/validations";
import { sendTeamInviteEmail } from "@/lib/email-notifications";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;

  const members = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      memberType: true,
      countryCode: true,
      createdAt: true,
      _count: {
        select: {
          leaveRequests: {
            where: {
              status: "APPROVED",
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(members);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as Record<string, unknown>).role as string;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = teamMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, role, memberType, countryCode } = parsed.data;
    const orgId = (session.user as Record<string, unknown>).organizationId as string;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    // Generate a temporary password for the new team member
    const tempPassword = Math.random().toString(36).slice(-10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const member = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: role as "ADMIN" | "MANAGER" | "MEMBER",
        memberType: memberType as "EMPLOYEE" | "CONTRACTOR" | "FREELANCER",
        countryCode,
        organizationId: orgId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        memberType: true,
        countryCode: true,
        createdAt: true,
      },
    });

    const inviterName = session.user.name ?? "Your admin";
    const orgName = ((session.user as Record<string, unknown>).organizationName as string) ?? "your team";

    sendTeamInviteEmail({
      inviteeName: name,
      inviterName,
      orgName,
      email,
      tempPassword,
    }).catch((err) => console.error("Invite email error:", err));

    return NextResponse.json(
      { ...member, tempPassword },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create team member error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

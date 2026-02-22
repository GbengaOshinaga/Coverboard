import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getDefaultLeaveTypes,
  getCountryPolicies,
  getHolidaysForYear,
} from "@/lib/country-policies";
import { sendTeamInviteEmail } from "@/lib/email-notifications";
import { z } from "zod";

const onboardingSchema = z.object({
  countries: z.array(z.string().length(2)).min(1, "Select at least one country"),
  invites: z.array(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      countryCode: z.string().length(2),
    })
  ).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const userRole = (session.user as Record<string, unknown>).role as string;

  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can complete onboarding" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { countries, invites } = parsed.data;
    const currentYear = new Date().getFullYear();

    // Update the admin user's country to the first selected country
    await prisma.user.update({
      where: { id: userId },
      data: { countryCode: countries[0] },
    });

    // Create leave types based on selected countries
    const defaultLeaveTypes = getDefaultLeaveTypes(countries);

    const createdLeaveTypes = await Promise.all(
      defaultLeaveTypes.map((lt) =>
        prisma.leaveType.upsert({
          where: {
            name_organizationId: { name: lt.name, organizationId: orgId },
          },
          create: {
            name: lt.name,
            color: lt.color,
            isPaid: lt.isPaid,
            defaultDays: lt.defaultDays,
            organizationId: orgId,
          },
          update: {},
        })
      )
    );

    // Create country-specific leave policies
    const countryPolicies = getCountryPolicies(countries);

    for (const cp of countryPolicies) {
      const leaveType = createdLeaveTypes.find(
        (lt) => lt.name === cp.leaveType
      );
      if (!leaveType) continue;

      await prisma.leavePolicy.upsert({
        where: {
          countryCode_leaveTypeId: {
            countryCode: cp.countryCode,
            leaveTypeId: leaveType.id,
          },
        },
        create: {
          countryCode: cp.countryCode,
          annualAllowance: cp.annualAllowance,
          carryOverMax: cp.carryOverMax,
          leaveTypeId: leaveType.id,
        },
        update: {
          annualAllowance: cp.annualAllowance,
          carryOverMax: cp.carryOverMax,
        },
      });
    }

    // Create public holidays for the current year
    const holidays = getHolidaysForYear(countries, currentYear);

    for (const h of holidays) {
      await prisma.publicHoliday.upsert({
        where: {
          date_countryCode_organizationId: {
            date: h.date,
            countryCode: h.countryCode,
            organizationId: orgId,
          },
        },
        create: {
          name: h.name,
          date: h.date,
          countryCode: h.countryCode,
          organizationId: orgId,
        },
        update: {},
      });
    }

    // Also create holidays for next year
    const nextYearHolidays = getHolidaysForYear(countries, currentYear + 1);
    for (const h of nextYearHolidays) {
      await prisma.publicHoliday.upsert({
        where: {
          date_countryCode_organizationId: {
            date: h.date,
            countryCode: h.countryCode,
            organizationId: orgId,
          },
        },
        create: {
          name: h.name,
          date: h.date,
          countryCode: h.countryCode,
          organizationId: orgId,
        },
        update: {},
      });
    }

    // Create invited team members and send invite emails
    if (invites && invites.length > 0) {
      const inviterUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { organization: true },
      });
      const inviterName = inviterUser?.name ?? "Your admin";
      const orgName = inviterUser?.organization.name ?? "your team";

      for (const invite of invites) {
        const existing = await prisma.user.findUnique({
          where: { email: invite.email },
        });
        if (existing) continue;

        const tempPassword = Math.random().toString(36).slice(-10);
        const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

        await prisma.user.create({
          data: {
            name: invite.name,
            email: invite.email,
            passwordHash: tempPasswordHash,
            role: "MEMBER",
            memberType: "EMPLOYEE",
            countryCode: invite.countryCode,
            organizationId: orgId,
          },
        });

        sendTeamInviteEmail({
          inviteeName: invite.name,
          inviterName,
          orgName,
          email: invite.email,
          tempPassword,
        }).catch((err) => console.error("Onboarding invite email error:", err));
      }
    }

    // Mark onboarding as complete
    await prisma.organization.update({
      where: { id: orgId },
      data: { onboardingCompleted: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

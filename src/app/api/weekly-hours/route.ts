import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId");

  const sessionUser = session.user as Record<string, unknown>;
  const currentUserId = sessionUser.id as string;
  const userRole = sessionUser.role as string;
  const orgId = sessionUser.organizationId as string;

  const userId = targetUserId ?? currentUserId;

  if (targetUserId && targetUserId !== currentUserId && userRole === "MEMBER") {
    return NextResponse.json(
      { error: "You can only view your own weekly hours" },
      { status: 403 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: orgId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const entries = await prisma.userWeeklyHours.findMany({
    where: { userId },
    orderBy: { weekStartDate: "desc" },
    take: 52,
  });

  return NextResponse.json(entries);
}

const createSchema = z.object({
  userId: z.string(),
  weekStartDate: z.string().transform((s) => new Date(s)),
  hoursWorked: z.number().min(0).max(168),
});

const batchSchema = z.object({
  userId: z.string(),
  entries: z.array(
    z.object({
      weekStartDate: z.string().transform((s) => new Date(s)),
      hoursWorked: z.number().min(0).max(168),
    })
  ),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = sessionUser.organizationId as string;

  try {
    const body = await request.json();

    if (body.entries) {
      const parsed = batchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0].message },
          { status: 400 }
        );
      }

      const user = await prisma.user.findFirst({
        where: { id: parsed.data.userId, organizationId: orgId },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const results = await Promise.all(
        parsed.data.entries.map((entry) =>
          prisma.userWeeklyHours.upsert({
            where: {
              userId_weekStartDate: {
                userId: parsed.data.userId,
                weekStartDate: entry.weekStartDate,
              },
            },
            update: { hoursWorked: entry.hoursWorked },
            create: {
              userId: parsed.data.userId,
              weekStartDate: entry.weekStartDate,
              hoursWorked: entry.hoursWorked,
            },
          })
        )
      );

      return NextResponse.json(results, { status: 201 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: orgId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const entry = await prisma.userWeeklyHours.upsert({
      where: {
        userId_weekStartDate: {
          userId: parsed.data.userId,
          weekStartDate: parsed.data.weekStartDate,
        },
      },
      update: { hoursWorked: parsed.data.hoursWorked },
      create: {
        userId: parsed.data.userId,
        weekStartDate: parsed.data.weekStartDate,
        hoursWorked: parsed.data.hoursWorked,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Weekly hours error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

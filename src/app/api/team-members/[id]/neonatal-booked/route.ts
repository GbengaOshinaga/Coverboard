import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isoDateSchema, isoDateToUtc } from "@/lib/validations";

/**
 * Days of neonatal care leave already booked for one baby (identified by the
 * first full day in care), so the booking form can show what's left before
 * it's submitted. The person themselves, or an admin or manager in their team.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as Record<string, unknown>;
  const { id } = await params;
  if (id !== u.id && u.role !== "ADMIN" && u.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const member = await prisma.user.findFirst({
    where: { id, organizationId: u.organizationId as string },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  const parsed = isoDateSchema.safeParse(new URL(request.url).searchParams.get("firstDay"));
  if (!parsed.success) return NextResponse.json({ error: "Add the first full day in care" }, { status: 400 });

  const bookings = await prisma.leaveRequest.findMany({
    where: {
      userId: id,
      neonatalCareFirstDay: isoDateToUtc(parsed.data),
      status: { in: ["PENDING", "APPROVED"] },
      leaveType: { name: { contains: "neonatal", mode: "insensitive" } },
    },
    select: { startDate: true, endDate: true },
  });
  const daysBooked = bookings.reduce(
    (sum, b) => sum + Math.round((b.endDate.getTime() - b.startDate.getTime()) / 86_400_000) + 1,
    0
  );
  return NextResponse.json({ daysBooked, bookings: bookings.length });
}

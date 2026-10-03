import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadAcceptedCoverShifts } from "@/lib/cover-shifts";

/**
 * Accepted cover shifts for the calendar and weekly hours. Admins and
 * managers see everyone's (or one person's with ?userId=); staff only ever
 * see their own.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  const role = sessionUser.role as string;
  const myId = sessionUser.id as string;
  const { searchParams } = new URL(request.url);

  const from = new Date(searchParams.get("from") ?? "");
  const to = new Date(searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "'from' and 'to' dates are required" }, { status: 400 });
  }
  const requested = searchParams.get("userId") ?? undefined;
  const isReviewer = role === "ADMIN" || role === "MANAGER";
  if (requested && requested !== myId && !isReviewer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await loadAcceptedCoverShifts({
    organizationId: sessionUser.organizationId as string,
    from,
    to,
    userId: isReviewer ? requested : myId,
  });
  // The calendar doesn't need contact details.
  return NextResponse.json(
    rows.map(({ email: _email, department: _department, ...r }) => r)
  );
}

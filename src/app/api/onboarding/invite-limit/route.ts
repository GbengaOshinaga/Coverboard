import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { peopleLimit } from "@/lib/plan-headcount";

/**
 * How many people onboarding can invite under the team's plan. `max` is null
 * for an unlimited plan. The completion route enforces the same limit.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as Record<string, unknown> | undefined;
  if (!user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = await peopleLimit(user.organizationId as string);
  if (!limit || !Number.isFinite(limit.max)) return NextResponse.json({ max: null, room: null });
  return NextResponse.json({ max: limit.max, room: Math.max(0, limit.max - limit.used) });
}

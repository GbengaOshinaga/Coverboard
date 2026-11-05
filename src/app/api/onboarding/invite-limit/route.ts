import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { peopleLimit } from "@/lib/plan-headcount";
import { hasVerifiedEmail } from "@/lib/email-verification";

/**
 * How many people onboarding can invite under the team's plan. `max` is null
 * for an unlimited plan. The completion route enforces the same limit.
 * `emailVerified` is false until the admin has verified their email, which
 * inviting needs (the completion route checks it too).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as Record<string, unknown> | undefined;
  if (!user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [limit, emailVerified] = await Promise.all([
    peopleLimit(user.organizationId as string),
    hasVerifiedEmail(user.id as string),
  ]);
  if (!limit || !Number.isFinite(limit.max)) return NextResponse.json({ max: null, room: null, emailVerified });
  return NextResponse.json({ max: limit.max, room: Math.max(0, limit.max - limit.used), emailVerified });
}

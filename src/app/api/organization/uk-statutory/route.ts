import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enableUkStatutoryLeaveTypes } from "@/lib/uk-statutory";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const organizationId = user.organizationId as string;
  await enableUkStatutoryLeaveTypes(organizationId);
  trackServer(
    AnalyticsEvents.UK_STATUTORY_ENABLED,
    { source: "settings" },
    {
      userId: user.id as string,
      organizationId,
      role: "ADMIN",
      plan: user.plan as string | undefined,
    }
  );
  return NextResponse.json({ success: true });
}

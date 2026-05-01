import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enableUkStatutoryLeaveTypes } from "@/lib/uk-statutory";

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
  return NextResponse.json({ success: true });
}

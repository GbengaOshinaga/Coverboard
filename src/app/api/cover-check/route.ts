import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { checkRegionalCover } from "@/lib/regionCover";

const schema = z.object({
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  userId: z.string().optional(),
  excludeRequestId: z.string().optional(),
});

function isAdminOrManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const myId = sessionUser.id as string;
  const myRole = sessionUser.role as string;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const targetUserId = parsed.data.userId ?? myId;
  if (targetUserId !== myId && !isAdminOrManager(myRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await checkRegionalCover({
    organizationId: orgId,
    userId: targetUserId,
    startDate: parsed.data.startDate.slice(0, 10),
    endDate: parsed.data.endDate.slice(0, 10),
    excludeRequestId: parsed.data.excludeRequestId,
  });

  return NextResponse.json(result);
}

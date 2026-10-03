import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requestAuditContext } from "@/lib/audit";
import { dropOutOfCover } from "@/lib/cover-offers";

/** The person who accepted a cover shift drops out before it starts. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sessionUser = session.user as Record<string, unknown>;
  const result = await dropOutOfCover({
    offerId: id,
    actor: {
      id: sessionUser.id as string,
      email: (sessionUser.email as string | undefined) ?? null,
      role: sessionUser.role as string,
      name: (sessionUser.name as string | undefined) ?? undefined,
    },
    organizationId: sessionUser.organizationId as string,
    context: requestAuditContext(request),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requestAuditContext } from "@/lib/audit";
import { cancelCoverOffer } from "@/lib/cover-offers";

/** Withdraw an unanswered cover request (admins and managers). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sessionUser = session.user as Record<string, unknown>;
  const actor = {
    id: sessionUser.id as string,
    email: (sessionUser.email as string | undefined) ?? null,
    role: sessionUser.role as string,
    name: (sessionUser.name as string | undefined) ?? undefined,
  };
  const organizationId = sessionUser.organizationId as string;

  const result = await cancelCoverOffer({
    offerId: id,
    actor,
    organizationId,
    context: requestAuditContext(request),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

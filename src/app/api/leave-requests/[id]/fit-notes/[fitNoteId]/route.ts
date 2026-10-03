import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requestAuditContext } from "@/lib/audit";
import { removeFitNote } from "@/lib/leave-requests/fit-notes";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; fitNoteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, fitNoteId } = await params;
  const sessionUser = session.user as Record<string, unknown>;

  const result = await removeFitNote({
    requestId: id,
    fitNoteId,
    actor: {
      id: sessionUser.id as string,
      email: (sessionUser.email as string | undefined) ?? null,
      role: sessionUser.role as string,
    },
    organizationId: sessionUser.organizationId as string,
    context: requestAuditContext(request),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

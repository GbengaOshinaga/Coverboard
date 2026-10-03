import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { requestAuditContext } from "@/lib/audit";
import { recordFitNote } from "@/lib/leave-requests/fit-notes";
import { isoDateSchema, isoDateToUtc } from "@/lib/validations";

const schema = z.object({
  coversFrom: isoDateSchema,
  coversTo: isoDateSchema,
  receivedOn: isoDateSchema,
});

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

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const result = await recordFitNote({
    requestId: id,
    coversFrom: isoDateToUtc(parsed.data.coversFrom),
    coversTo: isoDateToUtc(parsed.data.coversTo),
    receivedOn: isoDateToUtc(parsed.data.receivedOn),
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
  return NextResponse.json({ ok: true }, { status: 201 });
}

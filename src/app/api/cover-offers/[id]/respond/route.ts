import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requestAuditContext } from "@/lib/audit";
import { z } from "zod";
import { respondToCoverOffer } from "@/lib/cover-offers";

const schema = z.object({ accept: z.boolean() });

/** The person asked accepts or declines. */
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
  const actor = {
    id: sessionUser.id as string,
    email: (sessionUser.email as string | undefined) ?? null,
    role: sessionUser.role as string,
    name: (sessionUser.name as string | undefined) ?? undefined,
  };
  const organizationId = sessionUser.organizationId as string;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const result = await respondToCoverOffer({
    offerId: id,
    accept: parsed.data.accept,
    actor,
    organizationId,
    context: requestAuditContext(request),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ status: result.status });
}

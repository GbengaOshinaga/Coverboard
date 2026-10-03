import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requestAuditContext } from "@/lib/audit";
import { z } from "zod";
import { createCoverOffer, createCoverOffers, listCoverOffersFor } from "@/lib/cover-offers";
import { isoDateSchema } from "@/lib/validations";

const schema = z.object({
  shiftTypeId: z.string().min(1),
  date: isoDateSchema,
  userId: z.string().min(1),
  leaveRequestId: z.string().optional(),
});

/** One person, several shifts, one email ("Ask for all"). */
const batchSchema = z.object({
  userId: z.string().min(1),
  shifts: z
    .array(z.object({ shiftTypeId: z.string().min(1), date: isoDateSchema }))
    .min(1)
    .max(60),
  leaveRequestId: z.string().optional(),
});

/** Ask someone to cover a short shift (admins and managers). */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  const actor = {
    id: sessionUser.id as string,
    email: (sessionUser.email as string | undefined) ?? null,
    role: sessionUser.role as string,
    name: (sessionUser.name as string | undefined) ?? undefined,
  };
  const organizationId = sessionUser.organizationId as string;

  const body = await request.json().catch(() => ({}));
  if (Array.isArray((body as { shifts?: unknown }).shifts)) {
    const batch = batchSchema.safeParse(body);
    if (!batch.success) {
      return NextResponse.json({ error: batch.error.issues[0].message }, { status: 400 });
    }
    const results = await createCoverOffers({
      ...batch.data,
      actor,
      organizationId,
      context: requestAuditContext(request),
    });
    const first = results.find((r) => !r.ok);
    if (results.every((r) => !r.ok) && first && !first.ok) {
      return NextResponse.json({ error: first.error, results }, { status: first.status });
    }
    return NextResponse.json({ results }, { status: 201 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const result = await createCoverOffer({
    ...parsed.data,
    actor,
    organizationId,
    context: requestAuditContext(request),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ id: result.offerId }, { status: 201 });
}

/** The signed-in person's cover requests. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  return NextResponse.json(
    await listCoverOffersFor(sessionUser.id as string, sessionUser.organizationId as string)
  );
}

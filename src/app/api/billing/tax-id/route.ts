import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { TAX_ID_TYPE_LABELS } from "@/config/billing-countries";

const ALLOWED_TYPES = new Set(Object.keys(TAX_ID_TYPE_LABELS));

const createSchema = z.object({
  type: z.string().refine((t) => ALLOWED_TYPES.has(t), {
    message: "Unsupported tax ID type",
  }),
  value: z.string().trim().min(2).max(64),
});

/**
 * GET /api/billing/tax-id — list tax IDs attached to the Stripe customer.
 * POST /api/billing/tax-id — add a tax ID. Stripe validates the format
 * synchronously (VIES / HMRC validation may happen asynchronously, exposed
 * via the returned `verification.status`).
 *
 * Admin-only, scoped to the requesting org's Stripe customer.
 */

async function getOrgCustomerId(orgId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { stripeCustomerId: true },
  });
  return org?.stripeCustomerId ?? null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!stripe)
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });

  const customerId = await getOrgCustomerId(sessionUser.organizationId as string);
  if (!customerId) {
    return NextResponse.json({ taxIds: [] });
  }

  try {
    const list = await stripe.customers.listTaxIds(customerId, { limit: 20 });
    return NextResponse.json({
      taxIds: list.data.map((t) => ({
        id: t.id,
        type: t.type,
        typeLabel: TAX_ID_TYPE_LABELS[t.type] ?? t.type,
        value: t.value,
        verificationStatus: t.verification?.status ?? null,
      })),
    });
  } catch (err) {
    console.error("List tax IDs failed:", err);
    return NextResponse.json({ taxIds: [] });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!stripe)
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid tax ID" },
      { status: 400 }
    );
  }

  const customerId = await getOrgCustomerId(sessionUser.organizationId as string);
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer for this organisation yet. Add a card first." },
      { status: 400 }
    );
  }

  try {
    const taxId = await stripe.customers.createTaxId(customerId, {
      // Stripe's typed enum is large; structural cast is acceptable since
      // ALLOWED_TYPES already constrains the values.
      type: parsed.data.type as Parameters<typeof stripe.customers.createTaxId>[1]["type"],
      value: parsed.data.value,
    });
    return NextResponse.json({
      id: taxId.id,
      type: taxId.type,
      typeLabel: TAX_ID_TYPE_LABELS[taxId.type] ?? taxId.type,
      value: taxId.value,
      verificationStatus: taxId.verification?.status ?? null,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : "Could not add tax ID";
    console.error("Add tax ID failed:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!stripe)
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });

  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id: sessionUser.organizationId as string },
    select: { stripeCustomerId: true },
  });
  if (!org?.stripeCustomerId) {
    return NextResponse.json({ error: "Tax ID not found" }, { status: 404 });
  }

  try {
    await stripe.customers.deleteTaxId(org.stripeCustomerId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete tax ID failed:", err);
    return NextResponse.json(
      { error: "Could not remove tax ID" },
      { status: 400 }
    );
  }
}

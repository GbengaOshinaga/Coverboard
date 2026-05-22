import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  channel: z
    .string()
    .min(1)
    .max(80)
    .refine(
      (c) => c.startsWith("#") || c.startsWith("C") || c.startsWith("G"),
      "Channel must be a channel name (#time-off) or channel ID"
    ),
});

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as Record<string, unknown>).role as string;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid channel" },
      { status: 400 }
    );
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: { organizationId: orgId },
  });

  if (!integration) {
    return NextResponse.json({ error: "Slack is not connected" }, { status: 404 });
  }

  const updated = await prisma.slackIntegration.update({
    where: { organizationId: orgId },
    data: { notificationChannel: parsed.data.channel },
    select: { notificationChannel: true },
  });

  return NextResponse.json({ channel: updated.notificationChannel });
}

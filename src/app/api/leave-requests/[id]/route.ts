import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyRequestStatusChange } from "@/lib/slack-notifications";
import { emailRequestStatusChange } from "@/lib/email-notifications";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = (session.user as Record<string, unknown>).id as string;
  const userRole = (session.user as Record<string, unknown>).role as string;

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { status } = parsed.data;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!leaveRequest) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      );
    }

    // Only the requester can cancel, only ADMIN/MANAGER can approve/reject
    if (status === "CANCELLED") {
      if (leaveRequest.userId !== userId) {
        return NextResponse.json(
          { error: "Only the requester can cancel their leave" },
          { status: 403 }
        );
      }
    } else {
      if (userRole !== "ADMIN" && userRole !== "MANAGER") {
        return NextResponse.json(
          { error: "Only admins and managers can approve or reject leave" },
          { status: 403 }
        );
      }
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        reviewedById:
          status !== "CANCELLED" ? userId : undefined,
        reviewedAt:
          status !== "CANCELLED" ? new Date() : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            countryCode: true,
            memberType: true,
          },
        },
        leaveType: {
          select: { id: true, name: true, color: true },
        },
        reviewedBy: {
          select: { id: true, name: true },
        },
      },
    });

    // Send notifications (fire and forget)
    if (status === "APPROVED" || status === "REJECTED") {
      notifyRequestStatusChange({
        requesterEmail: updated.user.email,
        status,
        leaveTypeName: updated.leaveType.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
        reviewerName: updated.reviewedBy?.name ?? "Unknown",
      }).catch((err) => console.error("Slack notification error:", err));

      emailRequestStatusChange({
        requesterEmail: updated.user.email,
        requesterName: updated.user.name,
        status,
        leaveTypeName: updated.leaveType.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
        reviewerName: updated.reviewedBy?.name ?? "Unknown",
      }).catch((err) => console.error("Email notification error:", err));
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update leave request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

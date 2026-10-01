import { prisma } from "@/lib/prisma";
import { bradfordForSickness } from "@/lib/sickness-spells";

/**
 * Recomputes and stores an employee's Bradford score from their approved
 * sickness, using the same spell merging as the compliance report. Fire and
 * forget: a failure is logged, never surfaced to the request.
 */
export function recomputeBradfordScore(userId: string): void {
  prisma.leaveRequest
    .findMany({
      where: {
        userId,
        OR: [
          { leaveType: { name: { contains: "SSP" } } },
          { leaveType: { name: { contains: "Sick" } } },
        ],
        status: "APPROVED",
      },
      select: { startDate: true, endDate: true },
    })
    .then((sick) =>
      prisma.user.update({
        where: { id: userId },
        data: { bradfordScore: bradfordForSickness(sick).score },
      })
    )
    .catch((err) => console.error("Bradford Factor update error:", err));
}

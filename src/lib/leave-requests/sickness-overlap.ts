import { prisma } from "@/lib/prisma";
import { SICKNESS_LEAVE_TYPE } from "@/lib/ssp-scope";

/**
 * Overlapping sickness records for one person would count the same days twice
 * (SSP, the 28-week limit, Bradford), whichever sickness types they use. Used
 * when booking sickness and when changing its end date. Returns an error
 * message, or null when there's no overlap.
 */
export async function sicknessOverlapError(input: {
  userId: string;
  startDate: Date;
  endDate: Date;
  /** The absence being changed, which can't clash with itself. */
  excludeId?: string;
}): Promise<string | null> {
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      userId: input.userId,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      status: { in: ["APPROVED", "PENDING"] },
      leaveType: SICKNESS_LEAVE_TYPE,
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  if (!clash) return null;
  const day = clash.startDate.toISOString().slice(0, 10);
  return `That would overlap another sickness absence starting ${day}. Change or cancel that one first.`;
}

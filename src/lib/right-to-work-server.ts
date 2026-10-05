import { prisma } from "@/lib/prisma";

/**
 * Keeps the person's right-to-work fields (verified, checked on, expires on)
 * in step with their latest check, so every screen and report reads one
 * status. Latest = most recent check date, then most recently recorded.
 */
export async function syncRightToWorkFromChecks(userId: string): Promise<void> {
  const latest = await prisma.rightToWorkCheck.findFirst({
    where: { userId },
    orderBy: [{ checkedOn: "desc" }, { createdAt: "desc" }],
    select: { checkedOn: true, hasRightToWork: true, expiresOn: true },
  });
  if (!latest) return;
  await prisma.user.update({
    where: { id: userId },
    data: {
      rightToWorkVerified: latest.hasRightToWork,
      rightToWorkCheckedOn: latest.checkedOn,
      rightToWorkExpiresOn: latest.hasRightToWork ? latest.expiresOn : null,
    },
  });
}

import type { Prisma } from "@prisma/client";

/**
 * Whether taking an admin away (demoting them, or giving them a leaving date)
 * would leave the team without one. Counts the admins who'll stay: active
 * and with no leaving date, so an admin working their notice doesn't count.
 *
 * Call it inside the transaction that makes the change. It takes a lock for
 * this team's admins first, so two admins removing each other at the same
 * moment are handled one after the other and the second is refused. An
 * advisory lock, not a lock on the organisation row: that row is also locked
 * by anything that adds a row pointing at it or updates it, which could
 * deadlock under load. This lock is only ever taken here, and released when
 * the transaction ends.
 */
export async function lastAdminError(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string
): Promise<string | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admins:${organizationId}`}, 0))`;
  const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (target?.role !== "ADMIN") return null;
  const staying = await tx.user.count({
    where: { organizationId, role: "ADMIN", isActive: true, leftOn: null, id: { not: userId } },
  });
  if (staying > 0) return null;
  return "This would leave the team without an admin: every other admin has left or has a leaving date. Make someone else an admin first.";
}

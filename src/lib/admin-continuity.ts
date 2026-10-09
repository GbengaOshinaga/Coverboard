import type { Prisma } from "@prisma/client";

/**
 * Whether taking an admin away (demoting them, or giving them a leaving date)
 * would leave the team without one. Counts the admins who'll stay: active
 * and with no leaving date, so an admin working their notice doesn't count.
 *
 * Call it inside the transaction that makes the change. It locks the
 * organisation's row first, so two admins removing each other at the same
 * moment are handled one after the other and the second is refused.
 */
export async function lastAdminError(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string
): Promise<string | null> {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
  const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (target?.role !== "ADMIN") return null;
  const staying = await tx.user.count({
    where: { organizationId, role: "ADMIN", isActive: true, leftOn: null, id: { not: userId } },
  });
  if (staying > 0) return null;
  return "This would leave the team without an admin: every other admin has left or has a leaving date. Make someone else an admin first.";
}

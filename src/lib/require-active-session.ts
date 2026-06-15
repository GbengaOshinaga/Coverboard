import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Clears a stale JWT after permanent deletion and returns to the marketing home. */
export const SIGN_OUT_AFTER_DELETION = `/api/auth/signout?callbackUrl=${encodeURIComponent("/?account_deleted=1")}`;

export type ActiveSession = {
  session: Session;
  userId: string;
  orgId: string;
};

/**
 * Requires a signed-in user whose account and organisation still exist.
 * After cron deletion the user row is removed and the org is stubbed — the JWT
 * may still be valid, so we sign out instead of sending people to onboarding.
 */
export async function requireActiveSession(): Promise<ActiveSession> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userId = sessionUser.id as string;
  const orgId = sessionUser.organizationId as string;

  const [user, org] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { deletionConfirmedAt: true },
    }),
  ]);

  if (!user || !org || org.deletionConfirmedAt) {
    redirect(SIGN_OUT_AFTER_DELETION);
  }

  return { session, userId, orgId };
}

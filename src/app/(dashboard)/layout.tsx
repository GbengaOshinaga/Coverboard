import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/require-active-session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { TrialBanner } from "@/components/layout/trial-banner";
import { DeletionScheduledBanner } from "@/components/layout/deletion-scheduled-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, orgId } = await requireActiveSession();

  const sessionUser = session.user as Record<string, unknown>;
  const role = sessionUser.role as string | undefined;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      onboardingCompleted: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      cardAdded: true,
      deletionScheduledFor: true,
    },
  });

  if (org && !org.onboardingCompleted) {
    redirect("/onboarding");
  }

  const isAdmin = role === "ADMIN";
  const banner = org ? (
    <>
      <DeletionScheduledBanner
        deletionScheduledFor={org.deletionScheduledFor}
        isAdmin={isAdmin}
      />
      <TrialBanner
        trialEndsAt={org.trialEndsAt}
        subscriptionStatus={org.subscriptionStatus}
        cardAdded={org.cardAdded}
        isAdmin={isAdmin}
      />
    </>
  ) : null;

  return <DashboardShell banner={banner}>{children}</DashboardShell>;
}

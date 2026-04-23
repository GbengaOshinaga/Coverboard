import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { TrialBanner } from "@/components/layout/trial-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const sessionUser = session.user as Record<string, unknown>;
  const orgId = sessionUser.organizationId as string;
  const role = sessionUser.role as string | undefined;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      onboardingCompleted: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      cardAdded: true,
    },
  });

  if (org && !org.onboardingCompleted) {
    redirect("/onboarding");
  }

  const banner = org ? (
    <TrialBanner
      trialEndsAt={org.trialEndsAt}
      subscriptionStatus={org.subscriptionStatus}
      cardAdded={org.cardAdded}
      isAdmin={role === "ADMIN"}
    />
  ) : null;

  return <DashboardShell banner={banner}>{children}</DashboardShell>;
}

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { onboardingCompleted: true },
  });

  if (org && !org.onboardingCompleted) {
    redirect("/onboarding");
  }

  return <DashboardShell>{children}</DashboardShell>;
}

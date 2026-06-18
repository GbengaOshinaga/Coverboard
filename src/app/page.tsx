import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/require-active-session";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <LandingPage />;
  }

  const { orgId } = await requireActiveSession();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { onboardingCompleted: true },
  });

  if (org && !org.onboardingCompleted) {
    redirect("/onboarding");
  }

  // Employees land on their personal hub; admins/managers on the team overview.
  const role = (session.user as Record<string, unknown>).role as
    | string
    | undefined;
  redirect(role === "MEMBER" ? "/my-time-off" : "/dashboard");
}

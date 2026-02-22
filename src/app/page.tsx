import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <LandingPage />;
  }

  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { onboardingCompleted: true },
  });

  if (org && !org.onboardingCompleted) {
    redirect("/onboarding");
  } else {
    redirect("/dashboard");
  }
}

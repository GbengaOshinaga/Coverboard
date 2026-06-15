import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/require-active-session";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { orgId } = await requireActiveSession();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { onboardingCompleted: true },
  });

  if (org?.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-sm">
              CB
            </div>
            <span className="text-lg font-bold text-gray-900">Coverboard</span>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
    </div>
  );
}

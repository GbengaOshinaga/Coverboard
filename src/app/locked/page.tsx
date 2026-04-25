import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/deletionScheduler";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function LockedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      plan: true,
      trialExpiredGraceEndsAt: true,
      deletionScheduledFor: true,
    },
  });

  if (!org || org.plan !== "LOCKED") redirect("/dashboard");

  const deletionDate = org.deletionScheduledFor ?? org.trialExpiredGraceEndsAt;
  const daysLeft = daysUntil(deletionDate);
  const isImminent = typeof daysLeft === "number" && daysLeft <= 7;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-lg">
          CB
        </div>
        <h1 className="text-center text-2xl font-bold text-gray-900">
          Your trial has ended
        </h1>
        {typeof daysLeft === "number" && deletionDate ? (
          <div
            className={`mt-4 rounded-md border p-3 text-center text-sm ${
              isImminent
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            You have <strong>{daysLeft} {daysLeft === 1 ? "day" : "days"}</strong>{" "}
            to reactivate before your data is permanently deleted on{" "}
            <strong>{DATE_FMT.format(deletionDate)}</strong>.
          </div>
        ) : (
          <p className="mt-3 text-center text-sm text-gray-600">
            Add your payment details to reactivate your Coverboard account.
          </p>
        )}
        <div className="mt-6 space-y-3">
          <Link
            href="/settings/billing/add-payment"
            className="flex w-full items-center justify-center rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Add payment details
          </Link>
          <Link
            href="/settings/billing"
            className="flex w-full items-center justify-center rounded-md border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Manage billing
          </Link>
          <Link
            href="/account/delete"
            className="flex w-full items-center justify-center rounded-md px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete account and all data now →
          </Link>
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">
          Questions? Email us at{" "}
          <a
            href="mailto:hello@coverboard.app"
            className="text-brand-600 hover:underline"
          >
            hello@coverboard.app
          </a>
        </p>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { CoverRequestsList } from "@/components/cover/cover-requests-list";

export const metadata: Metadata = { title: "Cover requests" };

export default function CoverRequestsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cover requests</h1>
        <p className="text-sm text-gray-500">
          Shifts you&apos;ve been asked to cover. Accept and you&apos;re on the
          shift; decline and your manager is told.
        </p>
      </div>
      <CoverRequestsList />
    </div>
  );
}

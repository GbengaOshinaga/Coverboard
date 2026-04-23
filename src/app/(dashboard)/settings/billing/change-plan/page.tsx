import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChangePlanPage() {
  return (
    <div className="mx-auto max-w-2xl py-4">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/settings/billing"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Change plan</h1>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">
            Self-service plan changes are on the way. In the meantime, email us at{" "}
            <a
              href="mailto:hello@coverboard.app"
              className="font-medium text-brand-600 hover:underline"
            >
              hello@coverboard.app
            </a>{" "}
            and we&apos;ll switch your plan the same day.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

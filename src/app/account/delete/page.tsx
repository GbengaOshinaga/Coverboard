"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function DeleteAccountPage() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmation !== "DELETE") {
      setError("You must type DELETE exactly to confirm.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Deletion failed");
        setSubmitting(false);
        return;
      }
      sessionStorage.setItem(
        "deletion-scheduled-for",
        typeof data.scheduledFor === "string"
          ? data.scheduledFor
          : new Date(data.scheduledFor).toISOString()
      );
      router.push("/account/delete/confirmed");
      setTimeout(() => {
        signOut({ redirect: false });
      }, 100);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl">
        <Card className="border-red-200">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-center text-red-900">
              Delete account and all data
            </CardTitle>
            <CardDescription className="text-center">
              This will permanently delete your organization, all team members,
              and every leave record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-semibold">What happens next</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-red-800">
                <li>Your subscription will be canceled immediately.</li>
                <li>Your data will be scheduled for deletion in 30 days.</li>
                <li>
                  During that 30 days you can cancel the deletion from your
                  billing page and restore your account.
                </li>
                <li>
                  After 30 days, all data is permanently and irrecoverably
                  deleted. This includes leave requests, sickness notes, and
                  earnings history.
                </li>
              </ul>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <Input
                id="confirmation"
                label="Type DELETE to confirm"
                type="text"
                placeholder="DELETE"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                required
              />
              <div className="flex gap-3">
                <Link
                  href="/settings/billing"
                  className="flex-1 rounded-md border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <Button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={submitting || confirmation !== "DELETE"}
                >
                  {submitting ? "Scheduling deletion..." : "Delete my account"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

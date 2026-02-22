"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, CheckCircle } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-gray-600 mb-4">
            Invalid reset link. Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-600 hover:text-brand-500"
          >
            Request password reset
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set new password</CardTitle>
        <CardDescription>
          Choose a strong password for your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        {success ? (
          <div className="text-center py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-4">
              <CheckCircle size={24} />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Password updated
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Your password has been reset successfully. You can now sign in with
              your new password.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <Input
              id="password"
              label="New password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              id="confirmPassword"
              label="Confirm password"
              type="password"
              placeholder="Enter your password again"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Resetting..." : "Reset password"}
            </Button>
            <div className="text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft size={14} />
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-lg">
            CB
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Reset your password
          </h1>
        </div>
        <Suspense fallback={
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-gray-500">Loading...</p>
            </CardContent>
          </Card>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
          <p className="mt-1 text-sm text-gray-500">
            We&apos;ll send you a link to reset it
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Forgot password</CardTitle>
            <CardDescription>
              Enter the email address you used to sign in
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center py-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-4">
                  <Mail size={24} />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  Check your email
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  If an account exists for <strong>{email}</strong>, we&apos;ve sent a
                  password reset link. It expires in 1 hour.
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-500"
                >
                  <ArrowLeft size={16} />
                  Back to sign in
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
                  id="email"
                  label="Email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send reset link"}
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
      </div>
    </div>
  );
}

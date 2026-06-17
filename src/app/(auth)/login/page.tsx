"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { trackClient, AnalyticsEvents } from "@/lib/analytics";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      // NextAuth passes our custom thrown error messages through as-is when
      // they don't match the default "CredentialsSignin" constant. Use the
      // real message when we have one (e.g. rate-limit feedback), otherwise
      // show the safe generic.
      const message =
        result.error && result.error !== "CredentialsSignin"
          ? result.error
          : "Invalid email or password";
      setError(message);
      trackClient(AnalyticsEvents.LOGIN_FAILED, {
        reason: result.error === "CredentialsSignin" ? "invalid_credentials" : result.error,
      });
    } else {
      trackClient(AnalyticsEvents.USER_LOGGED_IN);
      router.push("/");
      router.refresh();
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
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            See who&apos;s out, plan coverage, manage leave.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to access your team dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
              <PasswordInput
                id="password"
                label="Password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm text-brand-600 hover:text-brand-500"
                >
                  Forgot password?
                </Link>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-gray-500">
              Don&apos;t have a team yet?{" "}
              <Link
                href="/signup"
                className="font-medium text-brand-600 hover:text-brand-500"
              >
                Create one for free
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

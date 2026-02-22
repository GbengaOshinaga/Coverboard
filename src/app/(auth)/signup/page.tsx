"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, orgName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Signup failed");
        setLoading(false);
        return;
      }

      // Auto sign-in and redirect to onboarding
      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.ok) {
        router.push("/onboarding");
      } else {
        router.push("/login");
      }
    } catch {
      setError("Something went wrong");
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
            Start managing your team&apos;s leave
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Free to try. Set up in under 5 minutes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create your team</CardTitle>
            <CardDescription>
              We&apos;ll set up your organization and make you the admin
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
                id="orgName"
                label="Team / company name"
                type="text"
                placeholder="e.g. Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Your account
                </p>
                <div className="space-y-4">
                  <Input
                    id="name"
                    label="Full name"
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <Input
                    id="email"
                    label="Work email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    id="password"
                    label="Password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating your team..." : "Get started"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-brand-600 hover:text-brand-500"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

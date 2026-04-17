"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  COUNTRY_POLICIES,
  getDefaultLeaveTypes,
  getCountryPolicies,
} from "@/lib/country-policies";
import { Check, Plus, Trash2, ArrowRight, ArrowLeft, Globe, BookOpen, Users } from "lucide-react";

type Invite = { name: string; email: string; countryCode: string };

const STEPS = [
  { label: "Countries", icon: Globe },
  { label: "Leave policies", icon: BookOpen },
  { label: "Invite team", icon: Users },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [invites, setInvites] = useState<Invite[]>([{ name: "", email: "", countryCode: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Derived data
  const leaveTypes = useMemo(
    () => getDefaultLeaveTypes(selectedCountries),
    [selectedCountries]
  );
  const policies = useMemo(
    () => getCountryPolicies(selectedCountries),
    [selectedCountries]
  );

  function toggleCountry(code: string) {
    setSelectedCountries((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
  }

  function addInviteRow() {
    setInvites((prev) => [...prev, { name: "", email: "", countryCode: selectedCountries[0] ?? "" }]);
  }

  function updateInvite(index: number, field: keyof Invite, value: string) {
    setInvites((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function removeInvite(index: number) {
    setInvites((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleComplete() {
    setError("");
    setLoading(true);

    // Filter out empty invites
    const validInvites = invites.filter(
      (inv) => inv.name.trim() && inv.email.trim() && inv.countryCode
    );

    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countries: selectedCountries,
          invites: validInvites.length > 0 ? validInvites : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex flex-1 items-center">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  i < step
                    ? "bg-brand-600 text-white"
                    : i === step
                      ? "bg-brand-100 text-brand-700 ring-2 ring-brand-600"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`hidden text-sm font-medium sm:block ${
                  i <= step ? "text-gray-900" : "text-gray-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-3 h-0.5 flex-1 ${
                  i < step ? "bg-brand-600" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Select countries */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Where is your team based?</CardTitle>
            <CardDescription>
              Select every country where you have team members. We&apos;ll
              auto-configure leave policies and public holidays for each.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {COUNTRY_POLICIES.map((country) => {
                const isSelected = selectedCountries.includes(country.code);
                return (
                  <button
                    key={country.code}
                    onClick={() => toggleCountry(country.code)}
                    className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all ${
                      isSelected
                        ? "border-brand-600 bg-brand-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <span className="text-xl">{country.flag}</span>
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          isSelected ? "text-brand-700" : "text-gray-700"
                        }`}
                      >
                        {country.name}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {country.code === "GB"
                          ? "Regional bank holidays (by nation)"
                          : `${country.holidays.length} holidays`}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="ml-auto h-4 w-4 text-brand-600" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => setStep(1)}
                disabled={selectedCountries.length === 0}
              >
                Continue
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review leave policies */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Your leave policies</CardTitle>
            <CardDescription>
              Based on your selected countries, here are the leave types
              and statutory allowances we&apos;ll set up. You can customize
              these later in Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Leave types summary */}
            <div className="space-y-3 mb-6">
              <p className="text-sm font-medium text-gray-700">
                Leave types ({leaveTypes.length})
              </p>
              {leaveTypes.map((lt) => (
                <div
                  key={lt.name}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: lt.color }}
                    />
                    <span className="text-sm font-medium">{lt.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      Default: {lt.defaultDays} days
                    </span>
                    <Badge variant={lt.isPaid ? "success" : "outline"}>
                      {lt.isPaid ? "Paid" : "Unpaid"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Country-specific policies */}
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">
                Country-specific allowances
              </p>
              {selectedCountries.map((code) => {
                const country = COUNTRY_POLICIES.find(
                  (c) => c.code === code
                );
                if (!country) return null;
                const countryRules = policies.filter(
                  (p) => p.countryCode === code
                );

                return (
                  <div
                    key={code}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <p className="mb-2 text-sm font-medium">
                      {country.flag} {country.name}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {countryRules.map((rule) => (
                        <div
                          key={`${rule.countryCode}-${rule.leaveType}`}
                          className="rounded bg-gray-50 px-2 py-1.5"
                        >
                          <p className="text-[11px] text-gray-500 truncate">
                            {rule.leaveType.replace(" Leave", "")}
                          </p>
                          <p className="text-sm font-semibold">
                            {rule.annualAllowance} days
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep(2)}>
                Continue
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Invite team members */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Invite your team</CardTitle>
            <CardDescription>
              Add your team members now, or skip and invite them later from the
              Team page. We&apos;ll create accounts for them with temporary
              passwords.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invites.map((invite, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2"
                >
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                    <Input
                      placeholder="Full name"
                      value={invite.name}
                      onChange={(e) => updateInvite(i, "name", e.target.value)}
                    />
                    <Input
                      placeholder="Email"
                      type="email"
                      value={invite.email}
                      onChange={(e) =>
                        updateInvite(i, "email", e.target.value)
                      }
                    />
                    <select
                      value={invite.countryCode}
                      onChange={(e) =>
                        updateInvite(i, "countryCode", e.target.value)
                      }
                      className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      <option value="" disabled>
                        Country
                      </option>
                      {selectedCountries.map((code) => {
                        const c = COUNTRY_POLICIES.find(
                          (p) => p.code === code
                        );
                        return (
                          <option key={code} value={code}>
                            {c?.flag} {c?.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {invites.length > 1 && (
                    <button
                      onClick={() => removeInvite(i)}
                      className="mt-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addInviteRow}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another person
            </button>

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleComplete}
                  disabled={loading}
                >
                  {loading ? "Setting up..." : "Skip & finish"}
                </Button>
                <Button onClick={handleComplete} disabled={loading}>
                  {loading
                    ? "Setting up..."
                    : `Finish setup${invites.some((inv) => inv.email.trim()) ? " & invite" : ""}`}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

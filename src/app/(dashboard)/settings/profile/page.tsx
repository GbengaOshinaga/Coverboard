"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { COUNTRY_NAMES } from "@/lib/utils";
import { ProfileSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, CheckCircle, User, Lock, Bell } from "lucide-react";

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  memberType: string;
  countryCode: string;
  digestOptOut: boolean;
  createdAt: string;
  organization: { name: string };
};

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Digest toggle
  const [digestOptOut, setDigestOptOut] = useState(false);
  const [savingDigest, setSavingDigest] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    async function fetchProfile() {
      const res = await fetch("/api/auth/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setName(data.name);
        setDigestOptOut(data.digestOptOut);
      }
      setLoading(false);
    }
    fetchProfile();
  }, []);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess(false);
    setSavingProfile(true);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const data = await res.json();
        setProfileError(data.error ?? "Failed to update profile");
      } else {
        setProfileSuccess(true);
        toast("Profile updated", "success");
        await updateSession({ name });
        setTimeout(() => setProfileSuccess(false), 3000);
      }
    } catch {
      setProfileError("Something went wrong");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setPasswordError(data.error ?? "Failed to change password");
      } else {
        setPasswordSuccess(true);
        toast("Password changed", "success");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(false), 3000);
      }
    } catch {
      setPasswordError("Something went wrong");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-4">
        <ProfileSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Profile</h1>
          <p className="text-sm text-gray-500">
            Manage your account settings
          </p>
        </div>
      </div>

      {/* Profile overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar name={profile?.name ?? "User"} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">
                {profile?.name}
              </p>
              <p className="text-sm text-gray-500 truncate">{profile?.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={profile?.role === "ADMIN" ? "default" : "outline"}>
                  {profile?.role}
                </Badge>
                <Badge variant="outline">{profile?.memberType}</Badge>
                {profile?.countryCode && (
                  <Badge variant="outline">
                    {COUNTRY_NAMES[profile.countryCode] ?? profile.countryCode}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User size={18} />
            Edit profile
          </CardTitle>
          <CardDescription>Update your display name</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            {profileError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle size={16} />
                Profile updated successfully
              </div>
            )}
            <Input
              id="name"
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              id="email"
              label="Email"
              value={profile?.email ?? ""}
              disabled
              readOnly
            />
            <p className="text-xs text-gray-400">
              Email cannot be changed. Contact your admin if you need to update it.
            </p>
            <Button type="submit" disabled={savingProfile || name === profile?.name}>
              {savingProfile ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell size={18} />
            Email preferences
          </CardTitle>
          <CardDescription>Control which emails you receive</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-gray-900">Weekly digest</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Receive a Monday summary of who&apos;s out this week and next week
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!digestOptOut}
              disabled={savingDigest}
              onClick={async () => {
                const newValue = !digestOptOut;
                setDigestOptOut(newValue);
                setSavingDigest(true);
                try {
                  const res = await fetch("/api/auth/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ digestOptOut: newValue }),
                  });
                  if (res.ok) {
                    toast(newValue ? "Weekly digest disabled" : "Weekly digest enabled", "success");
                  }
                } catch {
                  setDigestOptOut(!newValue);
                } finally {
                  setSavingDigest(false);
                }
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                !digestOptOut ? "bg-brand-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  !digestOptOut ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock size={18} />
            Change password
          </CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle size={16} />
                Password changed successfully
              </div>
            )}
            <Input
              id="currentPassword"
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
              required
            />
            <Input
              id="newPassword"
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
            />
            <Input
              id="confirmPassword"
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Enter your new password again"
              required
            />
            <Button
              type="submit"
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {savingPassword ? "Changing..." : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

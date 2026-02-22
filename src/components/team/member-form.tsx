"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COUNTRY_NAMES } from "@/lib/utils";

type MemberData = {
  id?: string;
  name: string;
  email: string;
  role: string;
  memberType: string;
  countryCode: string;
};

const roleOptions = [
  { value: "MEMBER", label: "Member" },
  { value: "MANAGER", label: "Manager" },
  { value: "ADMIN", label: "Admin" },
];

const memberTypeOptions = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "FREELANCER", label: "Freelancer" },
];

const countryOptions = Object.entries(COUNTRY_NAMES).map(([code, name]) => ({
  value: code,
  label: `${name} (${code})`,
}));

export function MemberForm({
  initialData,
  onSubmit,
  onCancel,
}: {
  initialData?: MemberData;
  onSubmit: (data: MemberData) => Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = !!initialData?.id;
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [role, setRole] = useState(initialData?.role ?? "MEMBER");
  const [memberType, setMemberType] = useState(
    initialData?.memberType ?? "EMPLOYEE"
  );
  const [countryCode, setCountryCode] = useState(
    initialData?.countryCode ?? "NG"
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await onSubmit({
        id: initialData?.id,
        name,
        email,
        role,
        memberType,
        countryCode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Input
        id="memberName"
        label="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <Input
        id="memberEmail"
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={isEdit}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          id="memberRole"
          label="Role"
          options={roleOptions}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
        <Select
          id="memberType"
          label="Type"
          options={memberTypeOptions}
          value={memberType}
          onChange={(e) => setMemberType(e.target.value)}
        />
      </div>

      <Select
        id="memberCountry"
        label="Country"
        options={countryOptions}
        value={countryCode}
        onChange={(e) => setCountryCode(e.target.value)}
      />

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? isEdit
              ? "Saving..."
              : "Adding..."
            : isEdit
              ? "Save changes"
              : "Add member"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

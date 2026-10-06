"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COUNTRY_NAMES } from "@/lib/utils";
import { EMPLOYMENT_TYPE_OPTIONS, isHoursAveragedEmploymentType } from "@/lib/employment-types";

type MemberData = {
  id?: string;
  name: string;
  email: string;
  role: string;
  memberType: string;
  employmentType: string;
  daysWorkedPerWeek: number;
  fteRatio: number;
  rightToWorkVerified: boolean | null;
  department?: string;
  countryCode: string;
  workCountry: string;
  serviceStartDate?: string | null;
  /** New members only: the location to assign them to. */
  regionId?: string | null;
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
  defaultCountry = "GB",
  locations,
  onSubmit,
  onCancel,
}: {
  initialData?: MemberData;
  /**
   * Active locations, when the team uses them. Shown when adding someone, so
   * they don't land unassigned and silently miss cover.
   */
  locations?: { id: string; name: string }[];
  /** Country for a new member: the org's usual one, never a hardcoded guess. */
  defaultCountry?: string;
  onSubmit: (data: MemberData) => Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = !!initialData?.id;
  const showLocation = !isEdit && !!locations && locations.length > 0;
  const [regionId, setRegionId] = useState(
    locations && locations.length === 1 ? locations[0].id : ""
  );
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [role, setRole] = useState(initialData?.role ?? "MEMBER");
  const [memberType, setMemberType] = useState(
    initialData?.memberType ?? "EMPLOYEE"
  );
  const [countryCode, setCountryCode] = useState(
    initialData?.countryCode ?? defaultCountry
  );
  const [workCountry, setWorkCountry] = useState(
    initialData?.workCountry ?? initialData?.countryCode ?? defaultCountry
  );
  const [employmentType, setEmploymentType] = useState(
    initialData?.employmentType ?? "FULL_TIME"
  );
  const [daysWorkedPerWeek, setDaysWorkedPerWeek] = useState(
    initialData?.employmentType === "ZERO_HOURS"
      ? "0"
      : String(initialData?.daysWorkedPerWeek ?? 5)
  );
  const [fteRatio, setFteRatio] = useState(String(initialData?.fteRatio ?? 1));
  const [department, setDepartment] = useState(initialData?.department ?? "");
  const [serviceStartDate, setServiceStartDate] = useState(
    initialData?.serviceStartDate
      ? initialData.serviceStartDate.slice(0, 10)
      : ""
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
        employmentType,
        daysWorkedPerWeek:
          employmentType === "ZERO_HOURS" ? 0 : parseFloat(daysWorkedPerWeek),
        fteRatio: parseFloat(fteRatio),
        // Right to work comes from checks recorded on their profile, not
        // this form: keep whatever is on record.
        rightToWorkVerified: initialData?.rightToWorkVerified ?? null,
        department: department.trim() || undefined,
        countryCode,
        workCountry,
        serviceStartDate: serviceStartDate || null,
        ...(showLocation ? { regionId: regionId || null } : {}),
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <Select
        id="memberWorkCountry"
        label="Work country"
        options={countryOptions}
        value={workCountry}
        onChange={(e) => setWorkCountry(e.target.value)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          id="employmentType"
          label="Employment"
          options={EMPLOYMENT_TYPE_OPTIONS}
          value={employmentType}
          onChange={(e) => {
            setEmploymentType(e.target.value);
            if (e.target.value === "ZERO_HOURS") setDaysWorkedPerWeek("0");
          }}
        />
        <Input
          id="daysWorkedPerWeek"
          label="Days worked/week"
          type="number"
          min="0"
          max="7"
          step="0.5"
          value={daysWorkedPerWeek}
          onChange={(e) => setDaysWorkedPerWeek(e.target.value)}
          disabled={employmentType === "ZERO_HOURS"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isHoursAveragedEmploymentType(employmentType) ? (
          <p className="self-end pb-2 text-xs text-gray-500">
            FTE is worked out from their logged weekly hours.
          </p>
        ) : (
          <Input
            id="fteRatio"
            label="Contracted FTE"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={fteRatio}
            onChange={(e) => setFteRatio(e.target.value)}
          />
        )}
        <Input
          id="department"
          label="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="Engineering"
        />
        <Input
          id="serviceStartDate"
          label="Employment start date"
          type="date"
          value={serviceStartDate}
          onChange={(e) => setServiceStartDate(e.target.value)}
        />
      </div>

      {showLocation && (
        <Select
          id="regionId"
          label="Location"
          options={[
            { value: "", label: "No location yet" },
            ...locations!.map((l) => ({ value: l.id, label: l.name })),
          ]}
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
        />
      )}

      {workCountry === "GB" && (
        <p className="text-xs text-gray-500">
          Right to work: record checks on their profile, with the date and when
          any time-limited permission ends.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 sm:gap-3">
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

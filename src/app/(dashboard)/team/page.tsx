"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { MemberCard } from "@/components/team/member-card";
import { MemberForm } from "@/components/team/member-form";
import { BulkImportDialog } from "@/components/team/bulk-import-dialog";
import { CardSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Plus, Upload, AlertTriangle } from "lucide-react";

type Region = {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
  memberCount: number;
};

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  memberType: string;
  employmentType: string;
  daysWorkedPerWeek: number;
  fteRatio: number;
  rightToWorkVerified: boolean | null;
  department?: string | null;
  countryCode: string;
  workCountry: string | null;
  regionId?: string | null;
  region?: { id: string; name: string; color: string | null; isActive: boolean } | null;
  _count?: { leaveRequests: number };
};

export default function TeamPage() {
  const { data: session } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionsEnabled, setRegionsEnabled] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editMember, setEditMember] = useState<Member | undefined>();
  const [assigningRegion, setAssigningRegion] = useState<Member | null>(null);
  const [pendingRegionId, setPendingRegionId] = useState<string>("");
  const [pendingRegionNotes, setPendingRegionNotes] = useState("");
  const [savingRegion, setSavingRegion] = useState(false);

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const canManage = userRole === "ADMIN" || userRole === "MANAGER";
  const { toast } = useToast();

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/team-members");
    if (res.ok) {
      setMembers(await res.json());
    }
    setLoading(false);
  }, []);

  const fetchRegions = useCallback(async () => {
    const res = await fetch("/api/regions");
    if (res.ok) setRegions(await res.json());
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/organization/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const enabled = Boolean(data.regionsEnabled);
        setRegionsEnabled(enabled);
        if (enabled) fetchRegions();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetchRegions]);

  const filteredMembers = useMemo(() => {
    if (regionFilter === "ALL") return members;
    if (regionFilter === "UNASSIGNED")
      return members.filter((m) => !m.regionId);
    return members.filter((m) => m.regionId === regionFilter);
  }, [members, regionFilter]);

  const unassignedCount = useMemo(
    () => members.filter((m) => !m.regionId).length,
    [members]
  );

  function openAssignRegion(member: Member) {
    setAssigningRegion(member);
    setPendingRegionId(member.regionId ?? "");
    setPendingRegionNotes("");
  }

  async function handleAssignRegion(e: React.FormEvent) {
    e.preventDefault();
    if (!assigningRegion) return;
    setSavingRegion(true);
    try {
      const res = await fetch(`/api/team-members/${assigningRegion.id}/region`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: pendingRegionId === "" ? null : pendingRegionId,
          notes: pendingRegionNotes.trim() || null,
        }),
      });
      if (res.ok) {
        toast("Region updated", "success");
        setAssigningRegion(null);
        await fetchMembers();
      } else {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Failed to update region", "error");
      }
    } finally {
      setSavingRegion(false);
    }
  }

  async function handleAddMember(data: {
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
  }) {
    const res = await fetch("/api/team-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to add member");
    }
    const created = (await res.json()) as {
      ukStatutorySetupSuggested?: boolean;
    };

    toast("Team member added", "success");
    setShowForm(false);
    if (created.ukStatutorySetupSuggested && userRole === "ADMIN") {
      const enable = window.confirm(
        "You've added a UK-based employee. Would you like to enable UK statutory leave types? This includes SSP, maternity, paternity, and all other statutory entitlements."
      );
      if (enable) {
        const seedRes = await fetch("/api/organization/uk-statutory", {
          method: "POST",
        });
        if (seedRes.ok) {
          toast("UK statutory leave types enabled", "success");
        } else {
          toast("Could not enable UK statutory leave types", "error");
        }
      }
    }
    fetchMembers();
  }

  async function handleEditMember(data: {
    id?: string;
    name: string;
    role: string;
    memberType: string;
    employmentType: string;
    daysWorkedPerWeek: number;
    fteRatio: number;
    rightToWorkVerified: boolean | null;
    department?: string;
    countryCode: string;
    workCountry: string;
  }) {
    if (!data.id) return;

    const res = await fetch(`/api/team-members/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        role: data.role,
        memberType: data.memberType,
        employmentType: data.employmentType,
        daysWorkedPerWeek: data.daysWorkedPerWeek,
        fteRatio: data.fteRatio,
        rightToWorkVerified: data.rightToWorkVerified,
        department: data.department ?? null,
        countryCode: data.countryCode,
        workCountry: data.workCountry,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update member");
    }

    toast("Team member updated", "success");
    setEditMember(undefined);
    fetchMembers();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Team</h1>
          <p className="text-xs text-gray-500 sm:text-sm">
            {members.length} member{members.length !== 1 ? "s" : ""} in your
            team
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Button
              size="sm"
              variant="outline"
              className="sm:size-default"
              onClick={() => setShowBulkImport(true)}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Bulk import
            </Button>
            <Button
              size="sm"
              className="sm:size-default"
              onClick={() => setShowForm(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add member
            </Button>
          </div>
        )}
      </div>

      {regionsEnabled && regions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Region</label>
          <Select
            id="regionFilter"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            options={[
              { value: "ALL", label: `All regions (${members.length})` },
              {
                value: "UNASSIGNED",
                label: `Unassigned (${unassignedCount})`,
              },
              ...regions.map((r) => ({
                value: r.id,
                label: `${r.name}${r.isActive ? "" : " (inactive)"} (${r.memberCount})`,
              })),
            ]}
          />
        </div>
      )}

      {regionsEnabled && canManage && unassignedCount > 0 && regions.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1 text-amber-900">
            <p className="font-medium">
              {unassignedCount} team member{unassignedCount === 1 ? "" : "s"} {unassignedCount === 1 ? "has" : "have"} no
              region assigned.
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              Cover requirements only apply to members assigned to a region.
              Assign them below or{" "}
              <Link
                href="/settings/regions"
                className="font-medium underline hover:no-underline"
              >
                manage regions →
              </Link>
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="rounded-md border border-gray-100 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No team members match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              regionsEnabled={regionsEnabled}
              onEdit={canManage ? setEditMember : undefined}
              onAssignRegion={
                regionsEnabled && canManage ? openAssignRegion : undefined
              }
            />
          ))}
        </div>
      )}

      {members.some((m) => m.workCountry === "GB" && (m.rightToWorkVerified === false || m.rightToWorkVerified === null)) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>
            Compliance alert: Some employees do not have right-to-work
            verification completed.
          </p>
          {members.some(
            (m) =>
              m.workCountry === "GB" &&
              m.employmentType === "ZERO_HOURS" &&
              (m.rightToWorkVerified === false ||
                m.rightToWorkVerified === null)
          ) && (
            <p className="mt-1 font-medium">
              Right to work verification is especially important for zero-hours
              and bank staff.
            </p>
          )}
        </div>
      )}

      {/* Add member dialog */}
      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add team member"
      >
        <MemberForm
          onSubmit={handleAddMember}
          onCancel={() => setShowForm(false)}
        />
      </Dialog>

      {/* Edit member dialog */}
      <Dialog
        open={!!editMember}
        onClose={() => setEditMember(undefined)}
        title="Edit team member"
      >
        {editMember && (
          <MemberForm
            initialData={{
              ...editMember,
              department: editMember.department ?? undefined,
              workCountry: editMember.workCountry ?? editMember.countryCode,
            }}
            onSubmit={handleEditMember}
            onCancel={() => setEditMember(undefined)}
          />
        )}
      </Dialog>

      <BulkImportDialog
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImported={fetchMembers}
      />

      <Dialog
        open={!!assigningRegion}
        onClose={() => (savingRegion ? null : setAssigningRegion(null))}
        title={
          assigningRegion
            ? `Assign region — ${assigningRegion.name}`
            : "Assign region"
        }
      >
        {assigningRegion && (
          <form onSubmit={handleAssignRegion} className="space-y-4">
            <Select
              id="memberRegion"
              label="Region"
              value={pendingRegionId}
              onChange={(e) => setPendingRegionId(e.target.value)}
              options={[
                { value: "", label: "— No region —" },
                ...regions
                  .filter((r) => r.isActive || r.id === assigningRegion.regionId)
                  .map((r) => ({
                    value: r.id,
                    label: r.isActive ? r.name : `${r.name} (inactive)`,
                  })),
              ]}
            />
            <div className="space-y-1">
              <label
                htmlFor="regionNotes"
                className="block text-sm font-medium text-gray-700"
              >
                Notes (optional)
              </label>
              <input
                id="regionNotes"
                type="text"
                value={pendingRegionNotes}
                onChange={(e) => setPendingRegionNotes(e.target.value)}
                placeholder="Reason for change"
                maxLength={500}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-500">
                Recorded in the member&apos;s region history.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={savingRegion}>
                {savingRegion ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssigningRegion(null)}
                disabled={savingRegion}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

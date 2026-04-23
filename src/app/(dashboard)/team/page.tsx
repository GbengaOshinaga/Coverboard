"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { MemberCard } from "@/components/team/member-card";
import { MemberForm } from "@/components/team/member-form";
import { BulkImportDialog } from "@/components/team/bulk-import-dialog";
import { CardSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Plus, Upload } from "lucide-react";

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
  _count?: { leaveRequests: number };
};

export default function TeamPage() {
  const { data: session } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editMember, setEditMember] = useState<Member | undefined>();

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

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

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

    toast("Team member added", "success");
    setShowForm(false);
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

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onEdit={canManage ? setEditMember : undefined}
            />
          ))}
        </div>
      )}

      {members.some((m) => m.countryCode === "GB" && (m.rightToWorkVerified === false || m.rightToWorkVerified === null)) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Compliance alert: Some employees do not have right-to-work verification completed.
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
            initialData={{ ...editMember, department: editMember.department ?? undefined }}
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
    </div>
  );
}

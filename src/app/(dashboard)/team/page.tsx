"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { MemberCard } from "@/components/team/member-card";
import { MemberForm } from "@/components/team/member-form";
import { Plus } from "lucide-react";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  memberType: string;
  countryCode: string;
  _count?: { leaveRequests: number };
};

export default function TeamPage() {
  const { data: session } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editMember, setEditMember] = useState<Member | undefined>();

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const canManage = userRole === "ADMIN" || userRole === "MANAGER";

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

    setShowForm(false);
    fetchMembers();
  }

  async function handleEditMember(data: {
    id?: string;
    name: string;
    role: string;
    memberType: string;
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
        countryCode: data.countryCode,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update member");
    }

    setEditMember(undefined);
    fetchMembers();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500">
            {members.length} member{members.length !== 1 ? "s" : ""} in your
            team
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add member
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">
          Loading team...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onEdit={canManage ? setEditMember : undefined}
            />
          ))}
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
            initialData={editMember}
            onSubmit={handleEditMember}
            onCancel={() => setEditMember(undefined)}
          />
        )}
      </Dialog>
    </div>
  );
}

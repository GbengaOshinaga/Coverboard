"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Users,
} from "lucide-react";
import { REGION_PRESET_COLORS } from "@/lib/regionCover";

type Region = {
  id: string;
  name: string;
  description: string | null;
  minCover: number;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {REGION_PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-full border-2 transition ${
              value.toLowerCase() === c.toLowerCase()
                ? "border-gray-900 ring-2 ring-offset-1 ring-gray-300"
                : "border-white shadow-sm"
            }`}
            style={{ backgroundColor: c }}
            aria-label={`Use colour ${c}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX.test(value) ? value : "#3B82F6"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 w-10 cursor-pointer rounded border border-gray-300"
        />
        <span className="font-mono text-xs text-gray-500">{value}</span>
      </div>
    </div>
  );
}

export default function RegionsSettingsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Region | null>(null);
  const [deleting, setDeleting] = useState<Region | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMinCover, setNewMinCover] = useState("1");
  const [newColor, setNewColor] = useState(REGION_PRESET_COLORS[0]);

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMinCover, setEditMinCover] = useState("1");
  const [editColor, setEditColor] = useState(REGION_PRESET_COLORS[0]);
  const [editIsActive, setEditIsActive] = useState(true);

  const userRole = (session?.user as Record<string, unknown> | undefined)
    ?.role as string | undefined;
  const canManage = userRole === "ADMIN" || userRole === "MANAGER";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/regions");
      if (res.ok) setRegions(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openAdd() {
    setNewName("");
    setNewDescription("");
    setNewMinCover("1");
    setNewColor(
      REGION_PRESET_COLORS[regions.length % REGION_PRESET_COLORS.length]
    );
    setShowAdd(true);
  }

  function openEdit(r: Region) {
    setEditing(r);
    setEditName(r.name);
    setEditDescription(r.description ?? "");
    setEditMinCover(String(r.minCover));
    setEditColor(r.color ?? REGION_PRESET_COLORS[0]);
    setEditIsActive(r.isActive);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!HEX.test(newColor)) {
      toast("Pick a valid hex colour", "error");
      return;
    }
    const minCover = parseInt(newMinCover, 10);
    if (isNaN(minCover) || minCover < 1) {
      toast("Minimum cover must be at least 1", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          minCover,
          color: newColor,
        }),
      });
      if (res.ok) {
        toast("Region added", "success");
        setShowAdd(false);
        await refresh();
      } else {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Failed to add region", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!HEX.test(editColor)) {
      toast("Pick a valid hex colour", "error");
      return;
    }
    const minCover = parseInt(editMinCover, 10);
    if (isNaN(minCover) || minCover < 1) {
      toast("Minimum cover must be at least 1", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/regions/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          minCover,
          color: editColor,
          isActive: editIsActive,
        }),
      });
      if (res.ok) {
        toast("Region updated", "success");
        setEditing(null);
        await refresh();
      } else {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Failed to update", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(`/api/regions/${deleting.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({ unassignedMembers: 0 }));
        toast(
          data.unassignedMembers > 0
            ? `Region deleted. ${data.unassignedMembers} member(s) unassigned.`
            : "Region deleted",
          "success"
        );
        setDeleting(null);
        await refresh();
      } else {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Failed to delete", "error");
      }
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to settings
        </Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900 sm:text-2xl">
          Regions
        </h1>
        <p className="text-sm text-gray-500">
          Group team members by region or location and set minimum cover
          levels for each.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Your regions
              </CardTitle>
              <CardDescription>
                Each region needs at least its minimum cover level on every
                weekday (excluding bank holidays).
              </CardDescription>
            </div>
            {canManage && (
              <Button size="sm" className="shrink-0" onClick={openAdd}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add region
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : regions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">
                No regions yet. Add your first region to start tracking cover
                requirements.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {regions.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 rounded-lg border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color ?? "#9CA3AF" }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {r.name}
                        </span>
                        {!r.isActive && (
                          <Badge variant="outline" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      {r.description && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {r.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {r.memberCount} member
                          {r.memberCount === 1 ? "" : "s"}
                        </span>
                        <span>Min cover: {r.minCover}</span>
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(r)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleting(r)}
                        title="Delete"
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add region"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <Input
            id="regionName"
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. London North"
            required
            maxLength={80}
          />
          <Input
            id="regionDescription"
            label="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="What this region covers"
            maxLength={500}
          />
          <Input
            id="regionMinCover"
            label="Minimum cover (staff required per day)"
            type="number"
            min="1"
            max="1000"
            value={newMinCover}
            onChange={(e) => setNewMinCover(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Colour
            </label>
            <ColorPicker value={newColor} onChange={setNewColor} />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Adding..." : "Add region"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit region"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <Input
            id="editRegionName"
            label="Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
            maxLength={80}
          />
          <Input
            id="editRegionDescription"
            label="Description (optional)"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            maxLength={500}
          />
          <Input
            id="editRegionMinCover"
            label="Minimum cover (staff required per day)"
            type="number"
            min="1"
            max="1000"
            value={editMinCover}
            onChange={(e) => setEditMinCover(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Colour
            </label>
            <ColorPicker value={editColor} onChange={setEditColor} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editIsActive}
              onChange={(e) => setEditIsActive(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Active (uncheck to retire without deleting)
          </label>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!deleting}
        onClose={() => (deletingBusy ? null : setDeleting(null))}
        title="Delete region?"
      >
        {deleting && (
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-medium">
                Delete &ldquo;{deleting.name}&rdquo;?
              </p>
              {deleting.memberCount > 0 ? (
                <p className="mt-1 text-red-800">
                  {deleting.memberCount} team member
                  {deleting.memberCount === 1 ? "" : "s"} assigned to this
                  region will become unassigned. Their region history will
                  record this change. This cannot be undone.
                </p>
              ) : (
                <p className="mt-1 text-red-800">
                  No members are assigned to this region. This cannot be undone.
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleDelete}
                disabled={deletingBusy}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                {deletingBusy ? "Deleting..." : "Delete region"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleting(null)}
                disabled={deletingBusy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

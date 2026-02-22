"use client";

import { AlertTriangle, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type OverlapData = {
  overlapping: {
    id: string;
    user: { id: string; name: string; memberType: string };
    leaveType: { name: string; color: string };
    startDate: string;
    endDate: string;
    status: string;
  }[];
  teamCount: number;
  uniqueUsersOut: number;
  coverageRatio: number;
  isHighOverlap: boolean;
};

export function OverlapWarning({
  data,
  loading,
}: {
  data: OverlapData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-400">Checking for overlaps...</p>
      </div>
    );
  }

  if (!data || data.overlapping.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2 text-green-700">
          <Users className="h-4 w-4" />
          <p className="text-sm font-medium">No overlaps found</p>
        </div>
        <p className="mt-1 text-xs text-green-600">
          No one else is scheduled off during these dates.
        </p>
      </div>
    );
  }

  const coveragePercent = Math.round(data.coverageRatio * 100);

  return (
    <div
      className={`rounded-lg border p-4 ${
        data.isHighOverlap
          ? "border-red-200 bg-red-50"
          : "border-yellow-200 bg-yellow-50"
      }`}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          className={`h-4 w-4 ${
            data.isHighOverlap ? "text-red-500" : "text-yellow-500"
          }`}
        />
        <p
          className={`text-sm font-medium ${
            data.isHighOverlap ? "text-red-700" : "text-yellow-700"
          }`}
        >
          {data.uniqueUsersOut} team member{data.uniqueUsersOut !== 1 ? "s" : ""}{" "}
          already {data.uniqueUsersOut !== 1 ? "are" : "is"} off
        </p>
        <Badge variant={data.isHighOverlap ? "error" : "warning"}>
          {coveragePercent}% coverage
        </Badge>
      </div>

      {data.isHighOverlap && (
        <p className="mt-1 text-xs text-red-600">
          Warning: Team coverage will drop below 50% during these dates.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {data.overlapping.map((overlap) => (
          <div key={overlap.id} className="flex items-center gap-2">
            <Avatar name={overlap.user.name} size="sm" />
            <span className="text-xs text-gray-700">
              {overlap.user.name}
            </span>
            <div
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: overlap.leaveType.color }}
            >
              {overlap.leaveType.name.replace(" Leave", "")}
            </div>
            {overlap.status === "PENDING" && (
              <Badge variant="warning" className="text-[10px]">
                Pending
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { COUNTRY_NAMES } from "@/lib/utils";

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
  region?: { id: string; name: string; color: string | null; isActive: boolean } | null;
  _count?: { leaveRequests: number };
};

const roleVariant: Record<string, "default" | "warning" | "outline"> = {
  ADMIN: "default",
  MANAGER: "warning",
  MEMBER: "outline",
};

export function MemberCard({
  member,
  regionsEnabled = false,
  onEdit,
  onAssignRegion,
}: {
  member: Member;
  regionsEnabled?: boolean;
  onEdit?: (member: Member) => void;
  onAssignRegion?: (member: Member) => void;
}) {
  const isOut = member._count?.leaveRequests && member._count.leaveRequests > 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-sm sm:gap-4 sm:p-4">
      <div className="relative">
        <Avatar name={member.name} size="lg" />
        {isOut ? (
          <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-400" title="Currently out" />
        ) : null}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">{member.name}</p>
          <Badge variant={roleVariant[member.role] ?? "outline"}>
            {member.role}
          </Badge>
          {member.memberType !== "EMPLOYEE" && (
            <Badge variant="outline" className="text-[10px]">
              {member.memberType}
            </Badge>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{member.email}</p>
        {regionsEnabled &&
          (member.region ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-600">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: member.region.color ?? "#9CA3AF" }}
              />
              {member.region.name}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-gray-400">No region</p>
          ))}
        <p className="text-xs text-gray-400 mt-0.5">
          Work location:{" "}
          {member.workCountry
            ? COUNTRY_NAMES[member.workCountry] ?? member.workCountry
            : "Not set"}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {member.employmentType.replace("_", " ")} • FTE {member.fteRatio}
        </p>
        {(member.workCountry === "GB" &&
          (member.rightToWorkVerified === false ||
            member.rightToWorkVerified === null)) && (
          <p className="mt-1 inline-flex rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            Right to work verification required
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Link
          href={`/team/${member.id}`}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 hover:bg-brand-50 transition-colors text-center"
        >
          View
        </Link>
        {onEdit && (
          <button
            onClick={() => onEdit(member)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
        )}
        {onAssignRegion && (
          <button
            onClick={() => onAssignRegion(member)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Region
          </button>
        )}
      </div>
    </div>
  );
}

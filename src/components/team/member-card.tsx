"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { COUNTRY_NAMES } from "@/lib/utils";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  memberType: string;
  countryCode: string;
  _count?: { leaveRequests: number };
};

const roleVariant: Record<string, "default" | "warning" | "outline"> = {
  ADMIN: "default",
  MANAGER: "warning",
  MEMBER: "outline",
};

export function MemberCard({
  member,
  onEdit,
}: {
  member: Member;
  onEdit?: (member: Member) => void;
}) {
  const isOut = member._count?.leaveRequests && member._count.leaveRequests > 0;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
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
        <p className="text-xs text-gray-400 mt-0.5">
          {COUNTRY_NAMES[member.countryCode] ?? member.countryCode}
        </p>
      </div>

      {onEdit && (
        <button
          onClick={() => onEdit(member)}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Edit
        </button>
      )}
    </div>
  );
}

"use client";

import { fteLabel, type Fte } from "@/lib/fte";
import { rightToWorkLabel, rightToWorkStatus } from "@/lib/right-to-work";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { COUNTRY_NAMES } from "@/lib/utils";
import { formatEmploymentType } from "@/lib/employment-types";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  memberType: string;
  employmentType: string;
  daysWorkedPerWeek: number;
  fteRatio: number;
  /** Calculated by the API: logged hours for irregular-hours staff. */
  fte?: Fte;
  rightToWorkVerified: boolean | null;
  rightToWorkCheckedOn?: string | null;
  rightToWorkExpiresOn?: string | null;
  isActive?: boolean;
  leftOn?: string | null;
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
  showRightToWorkAlerts = false,
  showViewLink = false,
  onEdit,
  onAssignRegion,
}: {
  member: Member;
  regionsEnabled?: boolean;
  showRightToWorkAlerts?: boolean;
  /** Admins and managers can open full employee profiles. */
  showViewLink?: boolean;
  onEdit?: (member: Member) => void;
  onAssignRegion?: (member: Member) => void;
}) {
  const isOut = member._count?.leaveRequests && member._count.leaveRequests > 0;
  // Same rules as reports and the dashboard (src/lib/right-to-work.ts).
  const rtwStatus = rightToWorkStatus({
    verified: member.rightToWorkVerified,
    expiresOn: member.rightToWorkExpiresOn ? new Date(member.rightToWorkExpiresOn) : null,
  });
  const needsRightToWork = member.workCountry === "GB" && rtwStatus !== "checked";
  const isZeroHours = member.employmentType === "ZERO_HOURS";

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
            <p className="mt-1 text-xs italic text-gray-400">No location</p>
          ))}
        <p className="text-xs text-gray-400 mt-0.5">
          Work country:{" "}
          {member.workCountry
            ? COUNTRY_NAMES[member.workCountry] ?? member.workCountry
            : "Not set"}
        </p>
        {member.isActive === false && (
          <p className="text-xs font-medium text-amber-700">
            Left
            {member.leftOn
              ? ` ${new Date(member.leftOn).toLocaleDateString("en-GB", { timeZone: "UTC" })}`
              : ""}
            {" "}· records kept for 6 years
          </p>
        )}
        {member.isActive !== false && member.leftOn && (
          <p className="text-xs font-medium text-amber-700">
            Leaving {new Date(member.leftOn).toLocaleDateString("en-GB", { timeZone: "UTC" })}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          {formatEmploymentType(member.employmentType)} •{" "}
          {member.fte ? fteLabel(member.fte) : `FTE ${member.fteRatio}`}
        </p>
        {showRightToWorkAlerts && needsRightToWork && (
          <div
            className={`mt-1 rounded border px-2 py-1 text-[10px] font-medium ${
              isZeroHours
                ? "border-amber-300 bg-amber-100 text-amber-800"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <p>
              {rightToWorkLabel(rtwStatus, {
                expiresOn: member.rightToWorkExpiresOn ? new Date(member.rightToWorkExpiresOn) : null,
                checkedOn: member.rightToWorkCheckedOn ? new Date(member.rightToWorkCheckedOn) : null,
              })}
            </p>
            {isZeroHours && (
              <p className="mt-0.5 font-normal">
                Right to work verification is especially important for
                zero-hours and bank staff.
              </p>
            )}
          </div>
        )}
      </div>

      {(showViewLink || onEdit || onAssignRegion) && (
        <div className="flex shrink-0 flex-col gap-1.5">
          {showViewLink && (
            <Link
              href={`/team/${member.id}`}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 hover:bg-brand-50 transition-colors text-center"
            >
              View
            </Link>
          )}
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
              Location
            </button>
          )}
        </div>
      )}
    </div>
  );
}

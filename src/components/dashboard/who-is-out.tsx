"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateRange } from "@/lib/utils";
import { UserX } from "lucide-react";

type AbsentPerson = {
  id: string;
  user: { name: string; memberType: string };
  leaveType: { name: string; color: string };
  startDate: string;
  endDate: string;
};

export function WhoIsOut({ absences }: { absences: AbsentPerson[] }) {
  if (absences.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-gray-400" />
            Who&apos;s out today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-gray-400">
            <div className="text-4xl mb-2">&#127881;</div>
            <p className="text-sm font-medium">Everyone is in today!</p>
            <p className="text-xs">No one has approved leave for today.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="h-5 w-5 text-red-400" />
          Who&apos;s out today
          <Badge variant="error">{absences.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {absences.map((absence) => (
            <div
              key={absence.id}
              className="flex items-center gap-3 rounded-lg border border-gray-100 p-3"
            >
              <Avatar name={absence.user.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {absence.user.name}
                  </p>
                  {absence.user.memberType !== "EMPLOYEE" && (
                    <Badge variant="outline" className="text-[10px]">
                      {absence.user.memberType}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {formatDateRange(
                    new Date(absence.startDate),
                    new Date(absence.endDate)
                  )}
                </p>
              </div>
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: absence.leaveType.color }}
              >
                {absence.leaveType.name.replace(" Leave", "")}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

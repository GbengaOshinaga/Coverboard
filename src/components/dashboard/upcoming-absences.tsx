"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateRange, countWeekdays } from "@/lib/utils";
import { CalendarClock } from "lucide-react";

type UpcomingAbsence = {
  id: string;
  user: { name: string; memberType: string };
  leaveType: { name: string; color: string };
  startDate: string;
  endDate: string;
  status: string;
};

export function UpcomingAbsences({
  absences,
}: {
  absences: UpcomingAbsence[];
}) {
  if (absences.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-gray-400" />
            Upcoming absences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-gray-400">
            No upcoming absences scheduled.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-brand-500" />
          Upcoming absences
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {absences.map((absence) => {
            const days = countWeekdays(
              new Date(absence.startDate),
              new Date(absence.endDate)
            );

            return (
              <div
                key={absence.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 p-3"
              >
                <Avatar name={absence.user.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {absence.user.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDateRange(
                      new Date(absence.startDate),
                      new Date(absence.endDate)
                    )}{" "}
                    &middot; {days} day{days !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {absence.status === "PENDING" && (
                    <Badge variant="warning">Pending</Badge>
                  )}
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: absence.leaveType.color }}
                    title={absence.leaveType.name}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

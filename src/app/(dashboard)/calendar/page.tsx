"use client";

import { useState, useEffect, useCallback } from "react";
import { addMonths, subMonths, format, startOfMonth, endOfMonth } from "date-fns";
import { MonthView } from "@/components/calendar/month-view";
import { Card, CardContent } from "@/components/ui/card";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    const params = new URLSearchParams({
      from: monthStart.toISOString(),
      to: monthEnd.toISOString(),
      status: "APPROVED",
    });

    const yearParam = new URLSearchParams({
      year: format(currentDate, "yyyy"),
    });

    const [leavesRes, holidaysRes] = await Promise.all([
      fetch(`/api/leave-requests?${params}`),
      fetch(`/api/holidays?${yearParam}`),
    ]);

    if (leavesRes.ok) {
      setLeaves(await leavesRes.json());
    }
    if (holidaysRes.ok) {
      setHolidays(await holidaysRes.json());
    }

    setLoading(false);
  }, [currentDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Calendar</h1>
        <p className="text-sm text-gray-500">
          View all team absences and public holidays at a glance
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-sm text-gray-400">Loading calendar...</div>
            </div>
          ) : (
            <MonthView
              currentDate={currentDate}
              leaves={leaves}
              holidays={holidays}
              onPrevMonth={() => setCurrentDate((d) => subMonths(d, 1))}
              onNextMonth={() => setCurrentDate((d) => addMonths(d, 1))}
            />
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="font-medium">Legend:</span>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
          Annual
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
          Sick
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#8b5cf6]" />
          Parental
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
          Compassionate
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-6 rounded bg-amber-100" />
          Public Holiday
        </div>
      </div>
    </div>
  );
}

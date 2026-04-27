"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  addMonths,
  subMonths,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { MonthView } from "@/components/calendar/month-view";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarSkeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";

const REGION_FILTER_STORAGE_KEY = "coverboard.calendar.regionFilter";

type Region = {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
  memberCount: number;
};

type LeaveData = {
  id: string;
  startDate: string;
  endDate: string;
  user: { id: string; name: string; regionId?: string | null };
  leaveType: { name: string; color: string };
};

type DailyCover = {
  date: string;
  available: number;
  required: number;
  isWeekend: boolean;
  isBankHoliday: boolean;
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [leaves, setLeaves] = useState<LeaveData[]>([]);
  const [holidays, setHolidays] = useState([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionsEnabled, setRegionsEnabled] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [coverDays, setCoverDays] = useState<DailyCover[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(REGION_FILTER_STORAGE_KEY);
    if (saved) setRegionFilter(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(REGION_FILTER_STORAGE_KEY, regionFilter);
  }, [regionFilter]);

  const fetchRegions = useCallback(async () => {
    const res = await fetch("/api/regions");
    if (res.ok) setRegions(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/organization/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const enabled = Boolean(data.regionsEnabled);
        setRegionsEnabled(enabled);
        if (enabled) fetchRegions();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetchRegions]);

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

    if (leavesRes.ok) setLeaves(await leavesRes.json());
    if (holidaysRes.ok) setHolidays(await holidaysRes.json());

    setLoading(false);
  }, [currentDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (regionFilter === "ALL" || regionFilter === "UNASSIGNED") {
      setCoverDays([]);
      return;
    }
    const calStart = startOfWeek(startOfMonth(currentDate));
    const calEnd = endOfWeek(endOfMonth(currentDate));
    const url = `/api/regions/${regionFilter}/cover/range?start=${format(calStart, "yyyy-MM-dd")}&end=${format(calEnd, "yyyy-MM-dd")}`;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.days) setCoverDays(data.days);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [regionFilter, currentDate]);

  const filteredLeaves = useMemo(() => {
    if (regionFilter === "ALL") return leaves;
    if (regionFilter === "UNASSIGNED")
      return leaves.filter((l) => !l.user.regionId);
    return leaves.filter((l) => l.user.regionId === regionFilter);
  }, [leaves, regionFilter]);

  const coverByDate = useMemo(() => {
    const map = new Map<string, DailyCover>();
    coverDays.forEach((d) => map.set(d.date, d));
    return map;
  }, [coverDays]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Team Calendar</h1>
        <p className="text-sm text-gray-500">
          View all team absences and public holidays at a glance
        </p>
      </div>

      {regionsEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Region</label>
          <Select
            id="calendarRegionFilter"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            options={[
              { value: "ALL", label: "All regions" },
              { value: "UNASSIGNED", label: "Unassigned" },
              ...regions.map((r) => ({
                value: r.id,
                label: r.isActive ? r.name : `${r.name} (inactive)`,
              })),
            ]}
          />
          {regionFilter !== "ALL" && regionFilter !== "UNASSIGNED" && (
            <span className="text-xs text-gray-500">
              Cover indicators show whether minimum cover is met each weekday.
            </span>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <CalendarSkeleton />
          ) : (
            <MonthView
              currentDate={currentDate}
              leaves={filteredLeaves}
              holidays={holidays}
              coverByDate={coverByDate}
              onPrevMonth={() => setCurrentDate((d) => subMonths(d, 1))}
              onNextMonth={() => setCurrentDate((d) => addMonths(d, 1))}
            />
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
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
        {regionsEnabled &&
          regionFilter !== "ALL" &&
          regionFilter !== "UNASSIGNED" && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                Cover OK
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                Below minimum
              </div>
            </>
          )}
      </div>
    </div>
  );
}

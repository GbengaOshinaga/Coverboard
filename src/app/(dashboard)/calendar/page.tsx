"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { addMonths, subMonths, addWeeks, subWeeks, format, endOfDay } from "date-fns";
import { useSession } from "next-auth/react";
import { MonthView, calendarRange } from "@/components/calendar/month-view";
import { AWAY_LEAVE_TYPE, canSeeLeaveReasons } from "@/lib/leave-privacy";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarSkeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";

const REGION_FILTER_STORAGE_KEY = "coverboard.calendar.regionFilter";
const VIEW_STORAGE_KEY = "coverboard.calendar.view";

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
  coverRequired: boolean;
};

type CoverShiftData = {
  offerId: string;
  userName: string;
  date: string;
  shiftName: string;
  locationId: string;
};

export default function CalendarPage() {
  const { data: session } = useSession();
  // Staff see colleagues as "Away" (leave-privacy.ts), so the legend says so.
  const seesColleaguesAsAway = !!session && !canSeeLeaveReasons((session.user as Record<string, unknown>)?.role);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [leaves, setLeaves] = useState<LeaveData[]>([]);
  // Accepted cover shifts (managers see everyone's; staff see their own).
  const [coverShifts, setCoverShifts] = useState<CoverShiftData[]>([]);
  const [holidays, setHolidays] = useState<Array<{ id: string; name: string; date: string; countryCode: string }>>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionsEnabled, setRegionsEnabled] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [coverDays, setCoverDays] = useState<DailyCover[]>([]);
  const [loading, setLoading] = useState(true);
  // Month or week, remembered in this browser.
  const [view, setView] = useState<"month" | "week">("month");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_STORAGE_KEY) === "week") setView("week");
    } catch {
      // storage unavailable: month view
    }
  }, []);
  function chooseView(next: "month" | "week") {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // not remembered, still switches
    }
  }

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
    // Every day on screen, including the ends of the months either side.
    const { start, end } = calendarRange(currentDate, view);

    const params = new URLSearchParams({
      from: start.toISOString(),
      to: endOfDay(end).toISOString(),
    });

    const coverParams = new URLSearchParams({
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
    });

    // A week or grid that spans New Year needs both years' holidays.
    const years = [...new Set([format(start, "yyyy"), format(end, "yyyy")])];
    const [leavesRes, coverRes, ...holidayRes] = await Promise.all([
      // Approved leave, with colleagues shown to staff as "Away".
      fetch(`/api/leave-calendar?${params}`),
      fetch(`/api/cover-shifts?${coverParams}`),
      ...years.map((year) => fetch(`/api/holidays?${new URLSearchParams({ year })}`)),
    ]);

    if (leavesRes.ok) setLeaves(await leavesRes.json());
    const holidayLists = await Promise.all(holidayRes.map((r) => (r.ok ? r.json() : [])));
    setHolidays(holidayLists.flat());
    setCoverShifts(coverRes.ok ? await coverRes.json() : []);

    setLoading(false);
  }, [currentDate, view]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (regionFilter === "ALL" || regionFilter === "UNASSIGNED") {
      setCoverDays([]);
      return;
    }
    const { start: calStart, end: calEnd } = calendarRange(currentDate, view);
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
  }, [regionFilter, currentDate, view]);

  const filteredLeaves = useMemo(() => {
    if (regionFilter === "ALL") return leaves;
    if (regionFilter === "UNASSIGNED")
      return leaves.filter((l) => !l.user.regionId);
    return leaves.filter((l) => l.user.regionId === regionFilter);
  }, [leaves, regionFilter]);

  const filteredCoverShifts = useMemo(() => {
    if (regionFilter === "ALL") return coverShifts;
    if (regionFilter === "UNASSIGNED") return [];
    return coverShifts.filter((c) => c.locationId === regionFilter);
  }, [coverShifts, regionFilter]);

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
          Team absences, cover shifts and public holidays at a glance
        </p>
      </div>

      <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5" role="group" aria-label="Calendar view">
        {(["month", "week"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => chooseView(v)}
            className={`rounded px-3 py-1 text-sm font-medium ${
              view === v ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {v === "month" ? "Month" : "Week"}
          </button>
        ))}
      </div>

      {regionsEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Location</label>
          <Select
            id="calendarRegionFilter"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            options={[
              { value: "ALL", label: "All locations" },
              { value: "UNASSIGNED", label: "Unassigned" },
              ...regions.map((r) => ({
                value: r.id,
                label: r.isActive ? r.name : `${r.name} (inactive)`,
              })),
            ]}
          />
          {regionFilter !== "ALL" && regionFilter !== "UNASSIGNED" && (
            <span className="text-xs text-gray-500">
              Cover indicators show whether minimum cover is met on each day the location requires it.
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
              coverShifts={filteredCoverShifts}
              holidays={holidays}
              coverByDate={coverByDate}
              view={view}
              onPrevMonth={() => setCurrentDate((d) => (view === "week" ? subWeeks(d, 1) : subMonths(d, 1)))}
              onNextMonth={() => setCurrentDate((d) => (view === "week" ? addWeeks(d, 1) : addMonths(d, 1)))}
            />
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
        <span className="font-medium">Legend:</span>
        {seesColleaguesAsAway && (
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AWAY_LEAVE_TYPE.color }} />
            Away (colleagues)
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm border border-emerald-400 bg-emerald-50" />
          Cover shift
        </div>
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

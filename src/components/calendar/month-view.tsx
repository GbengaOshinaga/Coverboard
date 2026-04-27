"use client";

import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
  isSameDay,
} from "date-fns";
import { DayCell, type CalendarEvent, type HolidayEvent, type CoverIndicator } from "./day-cell";
import { ChevronLeft, ChevronRight } from "lucide-react";

type LeaveData = {
  id: string;
  startDate: string;
  endDate: string;
  user: { name: string };
  leaveType: { name: string; color: string };
};

type HolidayData = {
  id: string;
  name: string;
  date: string;
  countryCode: string;
};

type DailyCoverInput = {
  date: string;
  available: number;
  required: number;
  isWeekend: boolean;
  isBankHoliday: boolean;
};

const WEEKDAYS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

export function MonthView({
  currentDate,
  leaves,
  holidays,
  coverByDate,
  onPrevMonth,
  onNextMonth,
}: {
  currentDate: Date;
  leaves: LeaveData[];
  holidays: HolidayData[];
  coverByDate?: Map<string, DailyCoverInput>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  function getEventsForDay(day: Date): CalendarEvent[] {
    return leaves
      .filter((leave) => {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return day >= start && day <= end;
      })
      .map((leave) => ({
        id: `${leave.id}-${day.toISOString()}`,
        userName: leave.user.name,
        leaveTypeName: leave.leaveType.name,
        color: leave.leaveType.color,
        isStart: isSameDay(day, new Date(leave.startDate)),
        isEnd: isSameDay(day, new Date(leave.endDate)),
      }));
  }

  function getHolidaysForDay(day: Date): HolidayEvent[] {
    return holidays
      .filter((h) => isSameDay(day, new Date(h.date)))
      .map((h) => ({
        id: h.id,
        name: h.name,
        countryCode: h.countryCode,
      }));
  }

  function getCoverForDay(day: Date): CoverIndicator | undefined {
    if (!coverByDate) return undefined;
    const key = format(day, "yyyy-MM-dd");
    const c = coverByDate.get(key);
    if (!c) return undefined;
    if (c.isWeekend || c.isBankHoliday) return undefined;
    return {
      ok: c.available >= c.required,
      available: c.available,
      required: c.required,
    };
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
          {format(currentDate, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={onPrevMonth}
            className="rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 sm:px-3 sm:py-1.5"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline text-sm font-medium">Prev</span>
          </button>
          <button
            onClick={onNextMonth}
            className="rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 sm:px-3 sm:py-1.5"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline text-sm font-medium">Next</span>
          </button>
        </div>
      </div>

      {/* Grid — horizontal scroll on very small screens */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[480px] overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {WEEKDAYS_FULL.map((day, i) => (
              <div
                key={day}
                className="px-1 py-1.5 text-center text-[10px] font-medium text-gray-500 uppercase sm:px-2 sm:py-2 sm:text-xs"
              >
                <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {days.map((day) => (
              <DayCell
                key={day.toISOString()}
                date={day}
                isCurrentMonth={isSameMonth(day, currentDate)}
                isToday={isToday(day)}
                events={getEventsForDay(day)}
                holidays={getHolidaysForDay(day)}
                cover={getCoverForDay(day)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

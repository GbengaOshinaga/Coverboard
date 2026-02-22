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
import { DayCell, type CalendarEvent, type HolidayEvent } from "./day-cell";

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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({
  currentDate,
  leaves,
  holidays,
  onPrevMonth,
  onNextMonth,
}: {
  currentDate: Date;
  leaves: LeaveData[];
  holidays: HolidayData[];
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

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {format(currentDate, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevMonth}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Prev
          </button>
          <button
            onClick={onNextMonth}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase"
            >
              {day}
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}

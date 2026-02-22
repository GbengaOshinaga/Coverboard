"use client";

import { cn } from "@/lib/utils";

export type CalendarEvent = {
  id: string;
  userName: string;
  leaveTypeName: string;
  color: string;
  isStart: boolean;
  isEnd: boolean;
};

export type HolidayEvent = {
  id: string;
  name: string;
  countryCode: string;
};

export function DayCell({
  date,
  isCurrentMonth,
  isToday,
  events,
  holidays,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  holidays: HolidayEvent[];
}) {
  const dayNumber = date.getDate();
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  return (
    <div
      className={cn(
        "min-h-[100px] border-b border-r border-gray-200 p-1",
        !isCurrentMonth && "bg-gray-50",
        isWeekend && isCurrentMonth && "bg-gray-50/50"
      )}
    >
      <div className="flex items-center justify-between px-1">
        <span
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
            isToday && "bg-brand-600 text-white font-bold",
            !isToday && isCurrentMonth && "text-gray-900",
            !isToday && !isCurrentMonth && "text-gray-400"
          )}
        >
          {dayNumber}
        </span>
        {events.length > 2 && (
          <span className="text-[10px] text-gray-400">
            +{events.length - 2}
          </span>
        )}
      </div>

      <div className="mt-0.5 space-y-0.5">
        {holidays.map((holiday) => (
          <div
            key={holiday.id}
            className="truncate rounded px-1 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800"
            title={`${holiday.name} (${holiday.countryCode})`}
          >
            {holiday.name}
          </div>
        ))}
        {events.slice(0, 2).map((event) => (
          <div
            key={event.id}
            className={cn(
              "truncate px-1 py-0.5 text-[10px] font-medium text-white",
              event.isStart && "rounded-l",
              event.isEnd && "rounded-r",
              !event.isStart && !event.isEnd && "rounded-none"
            )}
            style={{ backgroundColor: event.color }}
            title={`${event.userName} — ${event.leaveTypeName}`}
          >
            {event.isStart ? event.userName : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

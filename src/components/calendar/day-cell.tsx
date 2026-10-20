"use client";

import { cn } from "@/lib/utils";

export type CalendarEvent = {
  id: string;
  userName: string;
  leaveTypeName: string;
  color: string;
  isStart: boolean;
  isEnd: boolean;
  /** Their own request, still waiting for approval. */
  pending?: boolean;
};

export type HolidayEvent = {
  id: string;
  name: string;
  countryCode: string;
};

export type CoverShiftEvent = {
  id: string;
  userName: string;
  shiftName: string;
};

export type CoverIndicator = {
  ok: boolean;
  available: number;
  required: number;
};

export function DayCell({
  date,
  isCurrentMonth,
  isToday,
  events,
  holidays,
  cover,
  coverShifts = [],
  expanded = false,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  holidays: HolidayEvent[];
  cover?: CoverIndicator;
  /** Accepted cover shifts starting this day. */
  coverShifts?: CoverShiftEvent[];
  /** Week view: every absence, each with its name, in a taller cell. */
  expanded?: boolean;
}) {
  const shown = expanded ? events : events.slice(0, 2);
  const dayNumber = date.getDate();
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  return (
    <div
      className={cn(
        "border-b border-r border-gray-200 p-0.5 sm:p-1",
        expanded ? "min-h-[160px] sm:min-h-[220px]" : "min-h-[60px] sm:min-h-[100px]",
        !isCurrentMonth && "bg-gray-50",
        isWeekend && isCurrentMonth && "bg-gray-50/50"
      )}
    >
      <div className="flex items-center justify-between px-0.5 sm:px-1">
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] sm:h-6 sm:w-6 sm:text-xs",
              isToday && "bg-brand-600 text-white font-bold",
              !isToday && isCurrentMonth && "text-gray-900",
              !isToday && !isCurrentMonth && "text-gray-400"
            )}
          >
            {dayNumber}
          </span>
          {cover && isCurrentMonth && (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2",
                cover.ok ? "bg-emerald-500" : "bg-red-500"
              )}
              title={`${cover.available}/${cover.required} available${cover.ok ? "" : " — below minimum"}`}
            />
          )}
        </div>
        {!expanded && events.length > 2 && (
          <span className="text-[9px] text-gray-400 sm:text-[10px]">
            +{events.length - 2}
          </span>
        )}
      </div>

      <div className="mt-0.5 space-y-0.5">
        {holidays.map((holiday) => (
          <div
            key={holiday.id}
            className="truncate rounded px-0.5 py-px text-[8px] font-medium bg-amber-100 text-amber-800 sm:px-1 sm:py-0.5 sm:text-[10px]"
            title={`${holiday.name} (${holiday.countryCode})`}
          >
            <span className="hidden sm:inline">{holiday.name}</span>
            <span className="sm:hidden">{holiday.countryCode}</span>
          </div>
        ))}
        {coverShifts.map((c) => (
          <div
            key={c.id}
            className="truncate rounded border border-emerald-400 bg-emerald-50 px-0.5 py-px text-[8px] font-medium text-emerald-800 sm:px-1 sm:py-0.5 sm:text-[10px]"
            title={`${c.userName} — covering the ${c.shiftName} shift`}
          >
            {c.userName} · {c.shiftName}
          </div>
        ))}
        {shown.map((event) => (
          <div
            key={event.id}
            className={cn(
              "truncate px-0.5 py-px text-[8px] font-medium text-white sm:px-1 sm:py-0.5 sm:text-[10px]",
              event.isStart && "rounded-l",
              event.isEnd && "rounded-r",
              !event.isStart && !event.isEnd && "rounded-none"
            )}
            // Pending: outlined in the type's colour rather than filled.
            style={
              event.pending
                ? { color: event.color, boxShadow: `inset 0 0 0 1px ${event.color}`, backgroundColor: "white" }
                : { backgroundColor: event.color }
            }
            title={`${event.userName} — ${event.leaveTypeName}${event.pending ? " (waiting for approval)" : ""}`}
          >
            {event.isStart || expanded ? `${event.userName}${event.pending ? " (pending)" : ""}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

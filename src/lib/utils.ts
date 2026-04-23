import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatDateRange(start: Date, end: Date): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };

  if (startDate.toDateString() === endDate.toDateString()) {
    return startDate.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  }

  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.toLocaleDateString("en-US", opts)} – ${endDate.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  }

  return `${startDate.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${endDate.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export function countWeekdays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  const endDate = new Date(end);

  while (current <= endDate) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

export const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  KE: "Kenya",
  ZA: "South Africa",
  BR: "Brazil",
  GB: "United Kingdom",
  MX: "Mexico",
  PH: "Philippines",
  ID: "Indonesia",
  GH: "Ghana",
  EG: "Egypt",
  CO: "Colombia",
};

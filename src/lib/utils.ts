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

/**
 * A leave range the UK way: "20 Apr 2026", "13 – 16 May 2026",
 * "28 May – 2 Jun 2026", "31 Dec 2026 – 2 Jan 2027". Leave dates are stored
 * as UTC midnight, so they're read in UTC (otherwise they slip a day west of
 * London).
 */
export function formatDateRange(start: Date, end: Date): string {
  const s = new Date(start);
  const e = new Date(end);
  const f = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  if (ymd(s) === ymd(e)) return f(s, full);
  if (s.getUTCFullYear() !== e.getUTCFullYear()) return `${f(s, full)} – ${f(e, full)}`;
  if (s.getUTCMonth() !== e.getUTCMonth()) return `${f(s, { day: "numeric", month: "short" })} – ${f(e, full)}`;
  return `${f(s, { day: "numeric" })} – ${f(e, full)}`;
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

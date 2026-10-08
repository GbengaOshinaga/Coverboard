import test from "node:test";
import assert from "node:assert/strict";
import { getInitials, formatDateRange, countWeekdays } from "@/lib/utils";

test("getInitials returns first two initials in uppercase", () => {
  assert.equal(getInitials("Ada Lovelace"), "AL");
});

test("formatDateRange formats same-day range with one date", () => {
  const date = new Date("2026-04-20T00:00:00.000Z");
  assert.equal(formatDateRange(date, date), "20 Apr 2026");
});

test("formatDateRange: UK style, month and year said once", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  assert.equal(formatDateRange(d("2026-05-13"), d("2026-05-16")), "13 – 16 May 2026");
  assert.equal(formatDateRange(d("2026-05-28"), d("2026-06-02")), "28 May – 2 Jun 2026");
});

test("formatDateRange formats cross-year range with both years", () => {
  const start = new Date("2026-12-31T00:00:00.000Z");
  const end = new Date("2027-01-02T00:00:00.000Z");
  assert.equal(formatDateRange(start, end), "31 Dec 2026 – 2 Jan 2027");
});

test("countWeekdays includes weekdays and skips weekends", () => {
  // Monday to Sunday includes 5 weekdays.
  const start = new Date("2026-04-20T00:00:00.000Z");
  const end = new Date("2026-04-26T00:00:00.000Z");
  assert.equal(countWeekdays(start, end), 5);
});

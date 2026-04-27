import test from "node:test";
import assert from "node:assert/strict";
import { getInitials, formatDateRange, countWeekdays } from "@/lib/utils";

test("getInitials returns first two initials in uppercase", () => {
  assert.equal(getInitials("Ada Lovelace"), "AL");
});

test("formatDateRange formats same-day range with one date", () => {
  const date = new Date("2026-04-20T00:00:00.000Z");
  assert.equal(formatDateRange(date, date), "Apr 20, 2026");
});

test("formatDateRange formats cross-year range with both years", () => {
  const start = new Date("2026-12-31T00:00:00.000Z");
  const end = new Date("2027-01-02T00:00:00.000Z");
  assert.equal(formatDateRange(start, end), "Dec 31, 2026 – Jan 2, 2027");
});

test("countWeekdays includes weekdays and skips weekends", () => {
  // Monday to Sunday includes 5 weekdays.
  const start = new Date("2026-04-20T00:00:00.000Z");
  const end = new Date("2026-04-26T00:00:00.000Z");
  assert.equal(countWeekdays(start, end), 5);
});

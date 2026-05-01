import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateHolidayPayRate,
  calculateHolidayPayRateForEmployee,
  calculateWeeklyHolidayPayRate,
  isAnnualLeaveType,
  type WeeklyEarning,
} from "@/lib/holidayPay";
import { prisma } from "@/lib/prisma";

/** Build a week entry with sensible defaults. */
function week(
  weekStart: string,
  gross: number,
  opts: Partial<WeeklyEarning> = {}
): WeeklyEarning {
  return {
    week_start_date: weekStart,
    gross_earnings: gross,
    hours_worked: opts.hours_worked ?? 40,
    is_zero_pay_week: opts.is_zero_pay_week ?? false,
  };
}

test("returns 0 when there is no earnings history", () => {
  assert.equal(calculateHolidayPayRate([]), 0);
});

test("returns 0 when every week is a zero-pay week", () => {
  const weeks: WeeklyEarning[] = [
    week("2026-01-05", 0, { is_zero_pay_week: true }),
    week("2026-01-12", 0, { is_zero_pay_week: true }),
  ];
  assert.equal(calculateHolidayPayRate(weeks), 0);
});

test("zero-pay weeks are excluded from the average", () => {
  // Two paid weeks at £500, one zero-pay week that must not drag the
  // average down.
  const weeks: WeeklyEarning[] = [
    week("2026-01-05", 500),
    week("2026-01-12", 0, { is_zero_pay_week: true }),
    week("2026-01-19", 500),
  ];
  // Average weekly pay = (500 + 500) / 2 = £500 → daily = 500 / 5 = £100
  assert.equal(calculateHolidayPayRate(weeks), 100);
});

test("uses fewer than 52 weeks when that is all that is available", () => {
  // Only 10 paid weeks — the calculator should still work on whatever is
  // provided rather than requiring a full year.
  const weeks: WeeklyEarning[] = Array.from({ length: 10 }, (_, i) =>
    week(`2026-01-${String(i + 1).padStart(2, "0")}`, 400)
  );
  // Average = £400/wk → daily = £80
  assert.equal(calculateHolidayPayRate(weeks), 80);
});

test("caps the window at 52 paid weeks (most recent only)", () => {
  // 60 paid weeks: first 8 at £100, last 52 at £500.
  // Only the last 52 should count → daily = 500/5 = £100.
  const weeks: WeeklyEarning[] = [
    ...Array.from({ length: 8 }, (_, i) =>
      week(`2025-01-${String(i + 1).padStart(2, "0")}`, 100)
    ),
    ...Array.from({ length: 52 }, (_, i) =>
      week(`2025-03-${String(i + 1).padStart(2, "0")}`, 500)
    ),
  ];
  assert.equal(calculateHolidayPayRate(weeks), 100);
});

test("looks past zero-pay weeks to reach 52 paid weeks", () => {
  // 4 old paid weeks at £200, then 52 zero-pay weeks, then 48 paid weeks
  // at £500. Zero-pay weeks must not consume any of the 52-week window.
  const old = Array.from({ length: 4 }, (_, i) =>
    week(`2024-01-${String(i + 1).padStart(2, "0")}`, 200)
  );
  const gaps = Array.from({ length: 52 }, (_, i) =>
    week(`2024-06-${String(i + 1).padStart(2, "0")}`, 0, {
      is_zero_pay_week: true,
    })
  );
  const recent = Array.from({ length: 48 }, (_, i) =>
    week(`2025-08-${String(i + 1).padStart(2, "0")}`, 500)
  );
  const weeks = [...old, ...gaps, ...recent];

  // All 52 paid weeks: 4 at £200 + 48 at £500 = £800 + £24,000 = £24,800
  // Average weekly = 24800/52 ≈ £476.92 → daily ≈ £95.38
  assert.equal(calculateHolidayPayRate(weeks), 95.38);
});

test("includes overtime and commission in the average", () => {
  // A worker on £400 basic with two weeks of overtime at £600.
  // The test confirms the calculator uses *gross_earnings* rather than any
  // stripped-down basic figure — so overtime/commission flow through.
  const weeks: WeeklyEarning[] = [
    week("2026-02-02", 400), // basic only
    week("2026-02-09", 400), // basic only
    week("2026-02-16", 600), // basic + £200 overtime
    week("2026-02-23", 600), // basic + £200 commission
  ];
  // Average weekly = (400+400+600+600)/4 = £500 → daily = £100
  assert.equal(calculateHolidayPayRate(weeks), 100);
});

test("ignores zero-pay weeks even when marked with non-zero hours", () => {
  // Defensive: a week flagged as zero-pay must be dropped even if a caller
  // accidentally left non-zero earnings on the row.
  const weeks: WeeklyEarning[] = [
    week("2026-03-02", 500),
    week("2026-03-09", 123.45, { is_zero_pay_week: true }),
  ];
  // Only the first week counts → 500/5 = £100
  assert.equal(calculateHolidayPayRate(weeks), 100);
});

test("rounds to 2 decimal places", () => {
  // £333.33 / week → £66.666 / day → rounds to £66.67
  const weeks: WeeklyEarning[] = [week("2026-01-05", 333.33)];
  assert.equal(calculateHolidayPayRate(weeks), 66.67);
});

test("weekly helper returns the weekly average without dividing by 5", () => {
  const weeks: WeeklyEarning[] = [
    week("2026-01-05", 500),
    week("2026-01-12", 300),
  ];
  assert.equal(calculateWeeklyHolidayPayRate(weeks), 400);
});

test("isAnnualLeaveType matches common variants", () => {
  assert.equal(isAnnualLeaveType("Annual Leave"), true);
  assert.equal(isAnnualLeaveType("annual leave"), true);
  assert.equal(isAnnualLeaveType("Statutory Sick Pay (SSP)"), false);
  assert.equal(isAnnualLeaveType("Parental Leave"), false);
  assert.equal(isAnnualLeaveType(null), false);
});

test("calculateHolidayPayRateForEmployee returns null for non-GB employee", async () => {
  const original = prisma.user.findUnique as unknown;
  (prisma.user as unknown as { findUnique: unknown }).findUnique = async () => ({
    workCountry: "NG",
  });
  try {
    const result = await calculateHolidayPayRateForEmployee("u1", [
      week("2026-01-05", 500),
    ]);
    assert.equal(result, null);
  } finally {
    (prisma.user as unknown as { findUnique: unknown }).findUnique = original;
  }
});

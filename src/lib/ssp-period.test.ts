import test from "node:test";
import assert from "node:assert/strict";
import { sspDaysInPeriod } from "./ssp-period";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
// Brian works Mon, Wed, Fri; off sick Mon 19 – Fri 30 Oct 2026: 6 SSP days.
const brian = { startDate: d("2026-10-19"), endDate: d("2026-10-30"), sspDaysPaid: 6, weekdays: [0, 2, 4] };

test("whole absence inside the pay period: all 6 SSP days", () => {
  assert.equal(sspDaysInPeriod({ ...brian, from: d("2026-10-01"), to: d("2026-10-31") }), 6);
});

test("absence split across weekly pay periods: 3 + 3", () => {
  assert.equal(sspDaysInPeriod({ ...brian, from: d("2026-10-19"), to: d("2026-10-25") }), 3);
  assert.equal(sspDaysInPeriod({ ...brian, from: d("2026-10-26"), to: d("2026-11-01") }), 3);
});

test("never more than the stored SSP days (the 28-week cap already applied)", () => {
  const capped = { ...brian, sspDaysPaid: 4 };
  assert.equal(sspDaysInPeriod({ ...capped, from: d("2026-10-19"), to: d("2026-10-25") }), 3);
  assert.equal(sspDaysInPeriod({ ...capped, from: d("2026-10-26"), to: d("2026-11-01") }), 1);
});

test("pay period outside the absence: none", () => {
  assert.equal(sspDaysInPeriod({ ...brian, from: d("2026-11-02"), to: d("2026-11-30") }), 0);
});

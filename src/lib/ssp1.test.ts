import test from "node:test";
import assert from "node:assert/strict";
import { calculateSspEntitlement, SSP_NO_EARNINGS_REASON } from "@/lib/uk-compliance";
import { sspEarningsFromRows } from "@/lib/smpCalculator";
import {
  SSP1_REASON,
  ssp1DueWhenNotEntitled,
  ssp1ForLeaver,
  ssp1ForNoEarnings,
  ssp1ForSspEnding,
  ssp1Summary,
  sspRunsOut,
} from "@/lib/ssp1";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const weekdaysOnly = (day: Date) => day.getUTCDay() !== 0 && day.getUTCDay() !== 6;
const noPay = { grossEarnings: 0, hoursWorked: 0, isZeroPayWeek: true };
const paid = { grossEarnings: 400, hoursWorked: 30, isZeroPayWeek: false };

// ─── £0 earnings: no SSP (form SSP1 10/26) ─────────────────────────────

test("£0 earnings in the 8 weeks before means no SSP from 6 April 2026", () => {
  const r = calculateSspEntitlement({
    averageWeeklyEarnings: 0,
    sspDaysPaidInPeriod: 0,
    qualifyingDaysPerWeek: 5,
    onDate: d("2026-10-19"),
  });
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.equal(r.reason, SSP_NO_EARNINGS_REASON);
});

test("no earnings recorded is unknown, not £0: the flat rate", () => {
  const r = calculateSspEntitlement({
    averageWeeklyEarnings: null,
    sspDaysPaidInPeriod: 0,
    qualifyingDaysPerWeek: 5,
    weeklyRate: 123.25,
    onDate: d("2026-10-19"),
  });
  assert.equal(r.eligible, true);
  if (r.eligible) assert.equal(r.dailyRate, 24.65);
});

test("SSP earnings: £0 only when all 8 weeks are recorded as no pay", () => {
  const before = d("2026-10-19");
  assert.equal(sspEarningsFromRows(Array(8).fill(noPay), { beforeDate: before, serviceStartDate: d("2024-01-01") }), 0);
  // Three no-pay weeks and five not entered: unknown, so the flat rate.
  assert.equal(sspEarningsFromRows(Array(3).fill(noPay), { beforeDate: before, serviceStartDate: d("2024-01-01") }), null);
  // Any pay: the average as usual.
  assert.equal(sspEarningsFromRows([...Array(7).fill(noPay), paid], { beforeDate: before, serviceStartDate: null }), 50);
});

test("SSP earnings: a new starter needs every week since they started recorded as no pay", () => {
  const before = d("2026-10-19");
  const started = d("2026-10-01"); // 2 full weeks before
  assert.equal(sspEarningsFromRows([noPay, noPay], { beforeDate: before, serviceStartDate: started }), 0);
  assert.equal(sspEarningsFromRows([noPay], { beforeDate: before, serviceStartDate: started }), null);
});

test("ssp1ForNoEarnings: due 7 days after the first day off, from 6 April 2026 only", () => {
  const due = ssp1ForNoEarnings({ startDate: d("2026-10-19"), averageWeeklyEarnings: 0 });
  assert.deepEqual(due, { kind: "noEarnings", reason: SSP1_REASON.noEarnings, dueBy: "2026-10-26" });
  assert.equal(ssp1DueWhenNotEntitled(d("2026-10-19")).toISOString().slice(0, 10), "2026-10-26");
  assert.equal(ssp1ForNoEarnings({ startDate: d("2026-03-02"), averageWeeklyEarnings: 0 }), null);
  assert.equal(ssp1ForNoEarnings({ startDate: d("2026-10-19"), averageWeeklyEarnings: null }), null);
  assert.equal(ssp1ForNoEarnings({ startDate: d("2026-10-19"), averageWeeklyEarnings: 120 }), null);
});

// ─── SSP running out: due by the start of week 23 ────────────────────

test("sspRunsOut: a Mon–Fri worker off from a Monday gets 28 weeks; week 23 starts after 22", () => {
  const r = sspRunsOut({ startDate: d("2026-04-06"), daysPerWeek: 5, priorDaysPaid: 0, payable: weekdaysOnly });
  assert.ok(r);
  // 140 working days: the Friday of week 28.
  assert.equal(r.lastDay.toISOString().slice(0, 10), "2026-10-16");
  assert.equal(r.week22StartsOn.toISOString().slice(0, 10), "2026-08-31");
  assert.equal(r.week23StartsOn.toISOString().slice(0, 10), "2026-09-07");
});

test("sspRunsOut: SSP already paid in a linked absence counts", () => {
  const r = sspRunsOut({ startDate: d("2026-04-06"), daysPerWeek: 5, priorDaysPaid: 135, payable: weekdaysOnly });
  assert.ok(r);
  assert.equal(r.lastDay.toISOString().slice(0, 10), "2026-04-10");
  // Already past week 23: due straight away.
  assert.equal(r.week23StartsOn.toISOString().slice(0, 10), "2026-04-06");
});

test("ssp1ForSspEnding: from week 22, or when the absence booked runs past SSP's end", () => {
  const runsOut = { lastDay: d("2026-10-16"), week22StartsOn: d("2026-08-31"), week23StartsOn: d("2026-09-07") };
  // Week 10, back before SSP ends: nothing yet.
  assert.equal(ssp1ForSspEnding({ runsOut, absenceEnd: d("2026-06-30"), today: d("2026-06-08") }), null);
  // Week 10, but booked off past 16 Oct: due by the start of week 23.
  assert.deepEqual(ssp1ForSspEnding({ runsOut, absenceEnd: d("2026-11-30"), today: d("2026-06-08") }), {
    kind: "sspEnding",
    reason: SSP1_REASON.sspEnding,
    dueBy: "2026-09-07",
    sspEndsOn: "2026-10-16",
  });
  // Week 22 with an end date before SSP runs out: warn anyway.
  assert.equal(ssp1ForSspEnding({ runsOut, absenceEnd: d("2026-09-04"), today: d("2026-09-01") })?.kind, "sspEnding");
  // More than 7 days after SSP ended: no longer shown.
  assert.equal(ssp1ForSspEnding({ runsOut, absenceEnd: d("2026-11-30"), today: d("2026-10-24") }), null);
});

test("ssp1Summary says 'now' once the date has passed", () => {
  const due = ssp1ForNoEarnings({ startDate: d("2026-10-19"), averageWeeklyEarnings: 0 })!;
  assert.match(ssp1Summary(due, d("2026-10-20")), /Give them form SSP1 by 26\/10\/2026\.$/);
  assert.match(ssp1Summary(due, d("2026-10-27")), /Give them form SSP1 now \(it was due by 26\/10\/2026\)\.$/);
});

test("a leaver off sick: SSP stops on their last day, form due within 7 days", () => {
  assert.deepEqual(ssp1ForLeaver(d("2026-10-30")), {
    kind: "contractEnded",
    reason: SSP1_REASON.contractEnded,
    dueBy: "2026-11-06",
    sspEndsOn: "2026-10-30",
  });
});

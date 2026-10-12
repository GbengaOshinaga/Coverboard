/**
 * Our calculations against GOV.UK's own calculators, checked on 12 Oct 2026.
 * Every expected figure below was read from the GOV.UK calculator's result
 * for those answers (the "govuk" link on each case reproduces it):
 *   - https://www.gov.uk/calculate-your-holiday-entitlement
 *   - https://www.gov.uk/calculate-statutory-sick-pay
 *   - https://www.gov.uk/maternity-paternity-calculator
 *
 * GOV.UK's maternity and sick pay calculators round pay up to the penny from
 * unrounded average weekly earnings, and so do we. Its paternity calculator
 * rounds to the nearest penny instead; we round paternity pay up too, so we
 * can be 1p a week more than GOV.UK there, never less.
 *
 * If one fails, our rule has drifted from GOV.UK's: fix the rule, not the
 * figure. Recheck every April when rates change
 * (docs/internal/april-statutory-rate-update.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateUkProRatedAnnualLeave,
  calculateIrregularHoursAccrual,
  calculateSspPayableDays,
  calculateSspWeeklyRate,
  calculateSspDailyRate,
  sspPay,
} from "./uk-compliance";
import { prorateForStartDate } from "./working-week";
import { holidayOnLeaving } from "./holiday-on-leaving";
import { qualifyingWeek, latestStartForService, maternityLeaveLatestEnd } from "./smp-dates";
import { calculateAWE, calculateSMPPhaseRates, calculateSmpEntitlement, calculatePaternityPay } from "./smpCalculator";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const endOfDay = (iso: string) => new Date(`${iso}T23:59:59.999Z`);
const HOLIDAY = "https://www.gov.uk/calculate-your-holiday-entitlement/y";
const SSP = "https://www.gov.uk/calculate-statutory-sick-pay/y";
const MATERNITY = "https://www.gov.uk/maternity-paternity-calculator/y";

// ── Holiday: full leave year, days worked per week ──
// GOV.UK gives the exact figure and says employers "can choose to round up …
// but cannot round it down". We round up to whole days, so ours must be at
// least GOV.UK's and less than a day more.
for (const [days, govuk] of [
  [1, 5.6], [2, 11.2], [2.5, 14], [3, 16.8], [3.5, 19.6], [4, 22.4], [4.5, 25.2], [5, 28], [6, 28], [7, 28],
] as const) {
  test(`holiday, full year, ${days} days a week: GOV.UK ${govuk} days (${HOLIDAY}/regular/days-worked-per-week/full-year/${days})`, () => {
    const ours = calculateUkProRatedAnnualLeave({ employmentType: "PART_TIME", daysWorkedPerWeek: days, weeklyHours: [] })!;
    assert.ok(ours >= govuk && ours - govuk < 1, `ours ${ours}, GOV.UK ${govuk}`);
  });
}

// ── Holiday: starting part way through the leave year ──
// GOV.UK (and its guidance, section 3.2, under WTR reg 15A): full entitlement
// × months started ÷ 12, rounded up to the next half or whole day.
for (const c of [
  { start: "2026-06-01", yearStart: "2026-01-01", days: 5, govuk: 16.5 },
  { start: "2026-06-01", yearStart: "2026-01-01", days: 3, govuk: 10 },
  { start: "2026-03-17", yearStart: "2026-01-01", days: 5, govuk: 23.5 },
  { start: "2026-10-12", yearStart: "2026-04-01", days: 4, govuk: 11.5 },
  { start: "2026-12-31", yearStart: "2026-01-01", days: 5, govuk: 2.5 },
  { start: "2026-02-14", yearStart: "2026-01-01", days: 2.5, govuk: 13 },
  { start: "2027-01-20", yearStart: "2026-04-01", days: 5, govuk: 7 },
]) {
  const yearStart = d(c.yearStart);
  const yearEnd = new Date(Date.UTC(yearStart.getUTCFullYear() + 1, yearStart.getUTCMonth(), yearStart.getUTCDate()) - 1);
  const full = calculateUkProRatedAnnualLeave({ employmentType: "PART_TIME", daysWorkedPerWeek: c.days, weeklyHours: [] })!;
  const ours = prorateForStartDate(full, d(c.start), yearStart, yearEnd);
  test(
    `holiday, starter on ${c.start} (year from ${c.yearStart}), ${c.days} days a week: GOV.UK ${c.govuk} days (${HOLIDAY}/regular/days-worked-per-week/starting/${c.start}/${c.yearStart}/${c.days})`,
    () => assert.equal(ours, c.govuk)
  );
}

// ── Holiday: leaving part way through the leave year ──
// Days-based (WTR reg 14), as ours is. GOV.UK shows it rounded up to one
// decimal place; we keep two.
const ceil1 = (n: number) => Math.ceil(Number((n * 10).toFixed(6))) / 10;
for (const c of [
  { last: "2026-06-15", yearStart: "2026-01-01", yearEnd: "2026-12-31", year: 28, govuk: 12.8, days: 5 },
  { last: "2026-06-30", yearStart: "2026-01-01", yearEnd: "2026-12-31", year: 28, govuk: 13.9, days: 5 },
  { last: "2026-01-31", yearStart: "2026-01-01", yearEnd: "2026-12-31", year: 16.8, govuk: 1.5, days: 3 },
  { last: "2026-11-03", yearStart: "2026-04-01", yearEnd: "2027-03-31", year: 22.4, govuk: 13.4, days: 4 },
  { last: "2026-12-31", yearStart: "2026-01-01", yearEnd: "2026-12-31", year: 28, govuk: 28, days: 5 },
]) {
  test(`holiday, leaver on ${c.last} (year from ${c.yearStart}): GOV.UK ${c.govuk} days (${HOLIDAY}/regular/days-worked-per-week/leaving/${c.last}/${c.yearStart}/${c.days})`, () => {
    const { accrued } = holidayOnLeaving({
      unit: "days",
      yearEntitlement: c.year,
      carriedOver: 0,
      taken: 0,
      employedFrom: d(c.yearStart),
      yearEnd: endOfDay(c.yearEnd),
      lastDay: d(c.last),
    });
    assert.equal(ceil1(accrued), c.govuk);
  });
}

// ── Holiday: irregular hours, one pay period ──
// 12.07% of hours worked in the pay period, then (WTR reg 15B(5)) under half
// an hour is dropped and half an hour or more counts as a whole hour. Our
// helper gives the exact 12.07%; this checks the rate. The app doesn't yet
// round per pay period: see the report of 12 Oct 2026.
for (const [hours, govuk] of [[100, 12], [37.5, 5], [160, 19], [7, 1]] as const) {
  test(`holiday, irregular hours, ${hours} hours in the pay period: GOV.UK ${govuk} hours (${HOLIDAY}/irregular-hours-and-part-year/2026-01-01/${hours})`, () => {
    assert.equal(Math.round(calculateIrregularHoursAccrual(hours)), govuk);
  });
}

// ── Statutory Sick Pay (from 6 April 2026) ──
// Weekly pay, so average weekly earnings are the 8 weeks' total ÷ 8.
// Weekdays in GOV.UK's numbering (Sunday = 0); ours are Monday = 0.
const sspCases = [
  { name: "full rate, Mon–Fri, two weeks", from: "2026-06-01", to: "2026-06-12", earnings: "4000", days: "1,2,3,4,5", govukDays: 10, govuk: 246.5 },
  { name: "low earner (AWE £100), Mon–Fri, two weeks", from: "2026-06-01", to: "2026-06-12", earnings: "800", days: "1,2,3,4,5", govukDays: 10, govuk: 160 },
  { name: "full rate, Mon/Wed/Fri, two weeks", from: "2026-06-01", to: "2026-06-12", earnings: "4000", days: "1,3,5", govukDays: 6, govuk: 246.5 },
  { name: "low earner (AWE £150), Mon/Wed/Fri, two weeks", from: "2026-06-01", to: "2026-06-12", earnings: "1200", days: "1,3,5", govukDays: 6, govuk: 240 },
  { name: "full rate, Mon–Fri, Mon–Wed only", from: "2026-06-01", to: "2026-06-03", earnings: "4000", days: "1,2,3,4,5", govukDays: 3, govuk: 73.95 },
  { name: "low earner (AWE £137), Mon–Thu, 7 days", from: "2026-06-01", to: "2026-06-10", earnings: "1096", days: "1,2,3,4", govukDays: 7, govuk: 191.8 },
  { name: "full rate, Tue–Sat, a Saturday", from: "2026-06-06", to: "2026-06-06", earnings: "4000", days: "2,3,4,5,6", govukDays: 1, govuk: 24.65 },
  { name: "low earner (AWE £61.37), Mon–Fri, three weeks", from: "2026-06-01", to: "2026-06-19", earnings: "490.96", days: "1,2,3,4,5", govukDays: 15, govuk: 147.3 },
  { name: "low earner (AWE £61.36625), 80% rounded up", from: "2026-06-01", to: "2026-06-12", earnings: "490.93", days: "1,2,3,4,5", govukDays: 10, govuk: 98.2 },
  { name: "low earner (AWE £100.00125), 80% rounded up", from: "2026-06-01", to: "2026-06-12", earnings: "800.01", days: "1,2,3,4,5", govukDays: 10, govuk: 160.02 },
];
for (const c of sspCases) {
  const govukWeekdays = c.days.split(",").map(Number);
  const weekdays = govukWeekdays.map((day) => (day + 6) % 7);
  const q = weekdays.length;
  const days = calculateSspPayableDays(d(c.from), d(c.to), weekdays);
  const weekly = calculateSspWeeklyRate(calculateAWE(Array(8).fill(Number(c.earnings) / 8)));
  const pay = sspPay(days, calculateSspDailyRate(q, weekly), q);
  const url = `${SSP}/none/yes/no/${c.from}/${c.to}/no/eight_weeks_more/weekly/2026-05-29/2026-04-03/${c.earnings}/${encodeURIComponent(c.days)}`;
  test(
    `SSP, ${c.name}: GOV.UK ${c.govukDays} days, £${c.govuk.toFixed(2)} (${url})`,
    () => {
      assert.equal(days, c.govukDays);
      assert.equal(pay, c.govuk);
    }
  );
}

// ── Statutory Maternity Pay ──
// Weekly pay on Fridays; earnings are the 8 weeks up to the qualifying week.
const smpCases = [
  { due: "2026-12-25", start: "2026-12-01", earnings: 4800, qwEnd: "2026-09-12", serviceFrom: "2026-03-21", leaveEnd: "2027-11-29", eligible: true, weeks1to6: 540, weeks7to39: 194.32, paydays: "2026-09-11/2026-07-17" },
  { due: "2027-03-03", start: "2027-01-15", earnings: 4321.37, qwEnd: "2026-11-21", serviceFrom: "2026-05-30", leaveEnd: "2028-01-13", eligible: true, weeks1to6: 486.16, weeks7to39: 194.32, paydays: "2026-11-20/2026-09-25" },
  { due: "2026-11-15", start: "2026-10-01", earnings: 1300, qwEnd: "2026-08-08", serviceFrom: "2026-02-14", leaveEnd: "2027-09-29", eligible: true, weeks1to6: 146.25, weeks7to39: 146.25, paydays: "2026-08-07/2026-06-12" },
  { due: "2027-02-28", start: "2027-02-28", earnings: 1000, qwEnd: "2026-11-21", serviceFrom: "2026-05-30", leaveEnd: "2028-02-26", eligible: false, paydays: "2026-11-20/2026-09-25" },
  { due: "2027-06-07", start: "2027-04-20", earnings: 3999.99, qwEnd: "2027-02-27", serviceFrom: "2026-09-05", leaveEnd: "2028-04-17", eligible: true, weeks1to6: 450, weeks7to39: 194.32, paydays: "2027-02-26/2027-01-01" },
];
const iso = (date: Date) => date.toISOString().slice(0, 10);
for (const c of smpCases) {
  const url = `${MATERNITY}/maternity/${c.due}/${c.start}/yes/${c.paydays}/weekly/${c.earnings}/8/weekly_starting`;
  test(`SMP dates, due ${c.due}, leave from ${c.start} (${url})`, () => {
    const qw = qualifyingWeek(d(c.due));
    assert.equal(iso(qw.end), c.qwEnd, "qualifying week");
    assert.equal(iso(latestStartForService(qw)), c.serviceFrom, "latest start for 26 weeks' service");
    assert.equal(iso(maternityLeaveLatestEnd(d(c.start))), c.leaveEnd, "52 weeks' leave ends");
  });
  const awe = calculateAWE(Array(8).fill(c.earnings / 8));
  const rates = calculateSMPPhaseRates(awe);
  test(
    `SMP pay, due ${c.due}, £${c.earnings} over 8 weeks: GOV.UK ${c.eligible ? `£${c.weeks1to6!.toFixed(2)} then £${c.weeks7to39!.toFixed(2)}` : "not entitled"} (${url})`,
    () => {
      assert.equal(calculateSmpEntitlement(awe).eligible, c.eligible);
      if (c.eligible) {
        assert.equal(rates.phase1Weekly, c.weeks1to6);
        assert.equal(rates.phase2Weekly, c.weeks7to39);
      }
    }
  );
}

// ── Statutory Paternity Pay ──
// Due and born 3 March 2027, leave from the birth, weekly pay on Fridays.
for (const c of [
  { earnings: 4800, govuk: 194.32 },
  { earnings: 1200.06, govuk: 135.01 },
  { earnings: 1101.37, govuk: 123.9 },
  { earnings: 1000, govuk: null },
]) {
  // Not entitled: GOV.UK stops at the earnings question.
  const url = `${MATERNITY}/paternity/england/no/2027-03-03/2027-03-03/yes/yes/yes/yes/yes/2027-03-03/one_week/2026-11-20/2026-09-25/weekly/${c.earnings}${c.govuk === null ? "" : "/8/weekly_starting"}`;
  test(`SPP, £${c.earnings} over 8 weeks: GOV.UK ${c.govuk === null ? "not entitled" : `£${c.govuk.toFixed(2)} a week`} (${url})`, () => {
    const pay = calculatePaternityPay(calculateAWE(Array(8).fill(c.earnings / 8)));
    if (c.govuk === null) return assert.equal(pay.eligible, false);
    assert.ok(pay.weeklyRate !== null && pay.weeklyRate >= c.govuk && pay.weeklyRate - c.govuk <= 0.011, `ours ${pay.weeklyRate}, GOV.UK ${c.govuk}`);
  });
}

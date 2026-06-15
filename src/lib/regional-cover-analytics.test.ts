import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRegionalCover,
  type RegionForAnalytics,
  type LeaveForAnalytics,
} from "./regional-cover-analytics";

// Choose a NOW that's a Monday so week boundaries are easy to reason about.
const NOW = new Date("2026-06-01T12:00:00Z"); // Monday 1 June 2026
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function region(
  overrides: Partial<RegionForAnalytics> = {}
): RegionForAnalytics {
  return {
    id: "r1",
    name: "London",
    minCover: 2,
    memberIds: ["u1", "u2", "u3"],
    ...overrides,
  };
}

function leave(
  userId: string,
  startDate: Date,
  endDate: Date
): LeaveForAnalytics {
  return { userId, startDate, endDate };
}

// ---------- shape & defaults ----------

test("returns 13 weeks by default, oldest first, with stable Monday week keys", () => {
  const out = computeRegionalCover([region()], [], { now: NOW });
  assert.equal(out.length, 1);
  const r = out[0]!;
  assert.equal(r.weeklySeries.length, 13);
  // 13 weeks back from Monday 1 June 2026 = Monday 9 March 2026
  assert.equal(r.weeklySeries[0]!.weekKey, "2026-03-09");
  assert.equal(r.weeklySeries[12]!.weekKey, "2026-06-01");
});

test("drops empty regions from the report", () => {
  const out = computeRegionalCover(
    [region({ memberIds: [] })],
    [],
    { now: NOW }
  );
  assert.equal(out.length, 0);
});

// ---------- basic under-cover detection ----------

test("zero under-cover days when no one is on leave", () => {
  const out = computeRegionalCover([region()], [], { now: NOW });
  assert.equal(out[0]!.totalDaysBelowCover, 0);
  assert.equal(out[0]!.minCoverageObserved, 3);
});

test("flags days when absences drop coverage below minCover", () => {
  // London has 3 members, minCover = 2. If 2 of them are off the same day,
  // coverage = 1 < 2 → flagged.
  const out = computeRegionalCover(
    [region()], // minCover=2, 3 members
    [
      leave("u1", utc(2026, 5, 25), utc(2026, 5, 25)), // Mon 25 May
      leave("u2", utc(2026, 5, 25), utc(2026, 5, 25)), // Mon 25 May
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.totalDaysBelowCover, 1);
  assert.equal(out[0]!.minCoverageObserved, 1);
});

test("doesn't double-count a user with overlapping leaves on the same day", () => {
  // Same user has two overlapping approved leaves (admin booking + edit
  // scenario). They should count as 1 person off, not 2.
  const out = computeRegionalCover(
    [region({ memberIds: ["u1", "u2"], minCover: 2 })],
    [
      leave("u1", utc(2026, 5, 25), utc(2026, 5, 25)),
      leave("u1", utc(2026, 5, 25), utc(2026, 5, 25)),
    ],
    { now: NOW }
  );
  // Coverage = 2 - 1 = 1, which is < minCover 2 → 1 day flagged
  assert.equal(out[0]!.totalDaysBelowCover, 1);
});

test("counts each calendar day a multi-day leave covers", () => {
  // A 5-day leave (Mon–Fri) for both members drops coverage on all 5 days.
  const out = computeRegionalCover(
    [region({ memberIds: ["u1", "u2"], minCover: 2 })],
    [
      leave("u1", utc(2026, 5, 25), utc(2026, 5, 29)),
      leave("u2", utc(2026, 5, 25), utc(2026, 5, 25)),
    ],
    { now: NOW }
  );
  // Only 25 May has both off → 1 day flagged; the rest of the week u1 is
  // alone off so coverage = 1, still < 2 → all 5 days flagged
  assert.equal(out[0]!.totalDaysBelowCover, 5);
});

// ---------- weekly aggregation ----------

test("rolls under-cover days into the right week buckets", () => {
  // Pick a week clearly inside the window: week of Mon 25 May 2026.
  const out = computeRegionalCover(
    [region({ memberIds: ["u1", "u2"], minCover: 2 })],
    [
      leave("u1", utc(2026, 5, 25), utc(2026, 5, 27)), // Mon-Wed of that week
    ],
    { now: NOW }
  );
  const may25Week = out[0]!.weeklySeries.find(
    (w) => w.weekKey === "2026-05-25"
  );
  assert.ok(may25Week);
  assert.equal(may25Week!.daysBelowCover, 3);
  assert.equal(may25Week!.minCoverageObserved, 1);
});

// ---------- filtering & edge cases ----------

test("ignores leaves outside the trailing 13-week window", () => {
  const out = computeRegionalCover(
    [region({ memberIds: ["u1", "u2"], minCover: 2 })],
    [
      // 6 months back — well outside the 13-week window
      leave("u1", utc(2025, 12, 1), utc(2025, 12, 5)),
      leave("u2", utc(2025, 12, 1), utc(2025, 12, 5)),
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.totalDaysBelowCover, 0);
});

test("ignores leaves for users not in the region", () => {
  const out = computeRegionalCover(
    [region({ memberIds: ["u1", "u2"], minCover: 2 })],
    [
      // u_other isn't a member of London
      leave("u_other", utc(2026, 5, 25), utc(2026, 5, 25)),
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.totalDaysBelowCover, 0);
});

test("zero-minCover regions report stats but never flag a day as under-cover", () => {
  const out = computeRegionalCover(
    [region({ minCover: 0, memberIds: ["u1", "u2"] })],
    [
      leave("u1", utc(2026, 5, 25), utc(2026, 5, 25)),
      leave("u2", utc(2026, 5, 25), utc(2026, 5, 25)),
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.totalDaysBelowCover, 0);
  // But the observed coverage low is still reported.
  assert.equal(out[0]!.minCoverageObserved, 0);
});

// ---------- ordering ----------

test("sorts regions by totalDaysBelowCover descending — worst region first", () => {
  const out = computeRegionalCover(
    [
      {
        id: "r1",
        name: "London",
        minCover: 2,
        memberIds: ["u1", "u2"],
      },
      {
        id: "r2",
        name: "Manchester",
        minCover: 1,
        memberIds: ["u3", "u4"],
      },
    ],
    [
      // London: 2 of 2 off on Mon → 1 day flagged
      leave("u1", utc(2026, 5, 25), utc(2026, 5, 25)),
      leave("u2", utc(2026, 5, 25), utc(2026, 5, 25)),
      // Manchester: 2 of 2 off Mon-Wed → 3 days flagged (minCover 1)
      leave("u3", utc(2026, 5, 25), utc(2026, 5, 27)),
      leave("u4", utc(2026, 5, 25), utc(2026, 5, 27)),
    ],
    { now: NOW }
  );
  assert.equal(out[0]!.name, "Manchester");
  assert.equal(out[1]!.name, "London");
});

// ---------- weeksBack option ----------

test("weeksBack option controls window size", () => {
  const out = computeRegionalCover([region()], [], {
    now: NOW,
    weeksBack: 4,
  });
  assert.equal(out[0]!.weeklySeries.length, 4);
});

// ---------- defensive: NOW between weeks ----------

test("handles a NOW that falls mid-week (rounds to the containing Monday)", () => {
  const wednesday = new Date(NOW.getTime() + 2 * MS_PER_DAY); // Wed 3 June
  const out = computeRegionalCover([region()], [], { now: wednesday });
  // Most recent week's Monday is still 1 June, same as NOW above.
  assert.equal(out[0]!.weeklySeries[12]!.weekKey, "2026-06-01");
});

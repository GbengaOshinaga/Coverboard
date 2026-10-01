import test from "node:test";
import assert from "node:assert/strict";
import { bradfordForSickness, linkedPriorChain, mergeSicknessSpells } from "./sickness-spells";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const r = (start: string, end: string) => ({ startDate: d(start), endDate: d(end) });

test("mergeSicknessSpells: overlapping records are one spell", () => {
  const spells = mergeSicknessSpells([r("2026-10-05", "2026-10-07"), r("2026-10-01", "2026-10-06")]);
  assert.deepEqual(spells, [r("2026-10-01", "2026-10-07")]);
});

test("mergeSicknessSpells: separate records stay separate, even back to back", () => {
  const spells = mergeSicknessSpells([r("2026-10-01", "2026-10-01"), r("2026-10-02", "2026-10-02")]);
  assert.equal(spells.length, 2);
});

test("bradfordForSickness: overlaps don't double-count spells or days", () => {
  // Thu 1 – Wed 7 Oct is 5 weekdays, recorded across two overlapping rows.
  const b = bradfordForSickness([r("2026-10-01", "2026-10-06"), r("2026-10-05", "2026-10-07")]);
  assert.deepEqual(b, { spells: 1, days: 5, score: 5 });
});

test("bradfordForSickness: two separate spells", () => {
  // 1 day + 2 days, 2 spells → 2² × 3 = 12.
  const b = bradfordForSickness([r("2026-10-01", "2026-10-01"), r("2026-11-02", "2026-11-03")]);
  assert.deepEqual(b, { spells: 2, days: 3, score: 12 });
});

test("bradfordForSickness: none", () => {
  assert.deepEqual(bradfordForSickness([]), { spells: 0, days: 0, score: 0 });
});

const ssp = (start: string, end: string, paid: number) => ({ ...r(start, end), sspDaysPaid: paid });

test("linkedPriorChain: no prior spells", () => {
  assert.deepEqual(linkedPriorChain([], d("2026-10-01")), { linked: false, daysPaid: 0, spells: 0 });
});

test("linkedPriorChain: a spell ending more than 56 days before doesn't link", () => {
  // 1 Aug → 1 Oct is 61 days.
  assert.equal(linkedPriorChain([ssp("2026-07-27", "2026-08-01", 5)], d("2026-10-01")).linked, false);
});

test("linkedPriorChain: exactly 56 days links", () => {
  const c = linkedPriorChain([ssp("2026-08-01", "2026-08-06", 4)], d("2026-10-01"));
  assert.deepEqual(c, { linked: true, daysPaid: 4, spells: 1 });
});

test("linkedPriorChain: follows the chain past 56 days from the new spell", () => {
  // A (Jun) → B (Jul–Aug, within 56 days of A) → new spell 1 Oct (within 56
  // days of B but over 56 days from A). All three are one linked period.
  const prior = [ssp("2026-06-01", "2026-06-10", 8), ssp("2026-07-20", "2026-08-10", 16)];
  assert.deepEqual(linkedPriorChain(prior, d("2026-10-01")), { linked: true, daysPaid: 24, spells: 2 });
});

test("linkedPriorChain: stops at the first gap over 56 days", () => {
  const prior = [
    ssp("2026-01-05", "2026-01-09", 5), // over 56 days before C: breaks the chain
    ssp("2026-06-01", "2026-06-10", 8), // A
    ssp("2026-07-20", "2026-08-10", 16), // B
  ];
  assert.equal(linkedPriorChain(prior, d("2026-10-01")).daysPaid, 24);
});

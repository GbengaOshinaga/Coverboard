import test from "node:test";
import assert from "node:assert/strict";
import { evidenceFromFitNotes, fitNoteStatus } from "./fit-notes";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const absence = (start: string, end: string) => ({ startDate: d(start), endDate: d(end) });
const note = (from: string, to: string) => ({ coversFrom: d(from), coversTo: d(to) });

test("7 calendar days or fewer: self-certified, no fit note needed", () => {
  assert.deepEqual(fitNoteStatus(absence("2026-10-01", "2026-10-07"), []), { required: false });
});

test("8th day needs a fit note from day 8", () => {
  const s = fitNoteStatus(absence("2026-10-01", "2026-10-08"), []);
  assert.deepEqual(s, {
    required: true,
    requiredFrom: d("2026-10-08"),
    neededFrom: d("2026-10-08"),
    fullyCovered: false,
  });
});

test("a fit note covering day 8 to the end covers it", () => {
  const s = fitNoteStatus(absence("2026-10-01", "2026-10-20"), [note("2026-10-05", "2026-10-25")]);
  assert.equal(s.required && s.fullyCovered, true);
  assert.equal(s.required && s.neededFrom, null);
});

test("partial cover reports the first uncovered day", () => {
  const s = fitNoteStatus(absence("2026-10-01", "2026-10-31"), [note("2026-10-08", "2026-10-21")]);
  assert.deepEqual(s.required && s.neededFrom, d("2026-10-22"));
});

test("back-to-back renewals chain; a gap stops the chain", () => {
  const chained = fitNoteStatus(absence("2026-10-01", "2026-10-31"), [
    note("2026-10-22", "2026-11-04"),
    note("2026-10-08", "2026-10-21"),
  ]);
  assert.equal(chained.required && chained.fullyCovered, true);

  const gap = fitNoteStatus(absence("2026-10-01", "2026-10-31"), [
    note("2026-10-08", "2026-10-15"),
    note("2026-10-20", "2026-10-31"),
  ]);
  assert.deepEqual(gap.required && gap.neededFrom, d("2026-10-16"));
});

test("a fit note starting after day 8 leaves day 8 uncovered", () => {
  const s = fitNoteStatus(absence("2026-10-01", "2026-10-20"), [note("2026-10-10", "2026-10-20")]);
  assert.deepEqual(s.required && s.neededFrom, d("2026-10-08"));
});

test("evidenceFromFitNotes: required absences follow coverage; short ones keep their flag", () => {
  const long = fitNoteStatus(absence("2026-10-01", "2026-10-20"), []);
  assert.equal(evidenceFromFitNotes(long, true), false);
  const short = fitNoteStatus(absence("2026-10-01", "2026-10-03"), []);
  assert.equal(evidenceFromFitNotes(short, true), true);
  assert.equal(evidenceFromFitNotes(short, false), false);
});

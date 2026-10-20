import test from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY, glossaryForLeaveType } from "./glossary";

test("every glossary entry has a term, a short meaning and an https link if any", () => {
  for (const [key, entry] of Object.entries(GLOSSARY)) {
    assert.ok(entry.term.length > 0, key);
    assert.ok(entry.meaning.length > 20 && entry.meaning.length < 330, `${key}: keep it short`);
    if ("link" in entry && entry.link) assert.match(entry.link, /^https:\/\/(www\.gov\.uk|ico\.org\.uk)\//, key);
  }
});

test("leave types that need explaining get their meaning", () => {
  assert.equal(glossaryForLeaveType("Statutory Sick Pay (SSP)"), GLOSSARY.ssp);
  assert.equal(glossaryForLeaveType("Shared Parental Leave (SPL)"), GLOSSARY.spl);
  assert.equal(glossaryForLeaveType("Statutory Maternity Leave"), GLOSSARY.smp);
  assert.equal(glossaryForLeaveType("Adoption Leave"), GLOSSARY.smp);
  assert.equal(glossaryForLeaveType("Annual Leave"), null);
});

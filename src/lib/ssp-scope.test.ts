import test from "node:test";
import assert from "node:assert/strict";
import { isSspAbsence, sspAppliesTo } from "./ssp-scope";

test("SSP applies to any sickness absence of a UK worker, whatever the type is called", () => {
  assert.equal(isSspAbsence("Statutory Sick Pay (SSP)", "GB"), true);
  // Cara's "Sick Leave" (company sick pay) used to get no SSP at all.
  assert.equal(isSspAbsence("Sick Leave", "GB"), true);
  assert.equal(isSspAbsence("sickness", "GB"), true);
});

test("no SSP for other leave or for people who don't work in the UK", () => {
  assert.equal(isSspAbsence("Annual Leave", "GB"), false);
  assert.equal(isSspAbsence("Sick Leave", "NG"), false);
  assert.equal(isSspAbsence("Sick Leave", null), false);
  assert.equal(sspAppliesTo("GB"), true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv-export";

test("text that Excel would run as a formula is shown as text", () => {
  assert.equal(csvCell('=HYPERLINK("http://x","Click")'), `"'=HYPERLINK(""http://x"",""Click"")"`);
  assert.equal(csvCell("+44 7700 900123"), "'+44 7700 900123");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-1+cmd"), "'-1+cmd");
});

test("numbers, plain text and placeholders are left alone", () => {
  assert.equal(csvCell(-12.5), "-12.5");
  assert.equal(csvCell("-12.50"), "-12.50");
  assert.equal(csvCell("+3"), "+3");
  assert.equal(csvCell("-"), "-");
  assert.equal(csvCell("Sick leave"), "Sick leave");
  assert.equal(csvCell("Smith, Jo"), '"Smith, Jo"');
  assert.equal(csvCell(null), "");
});

test("toCsv uses the same cells", () => {
  assert.equal(toCsv([{ note: "=1+1" }], [{ key: "note", label: "Note" }]), "Note\n'=1+1");
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildEarningsCoverageRows } from "@/lib/earnings-coverage";

test("amber warning coverage excludes non-GB employees", () => {
  const rows = buildEarningsCoverageRows([
    {
      id: "gb",
      name: "UK User",
      email: "uk@example.com",
      countryCode: "GB",
      workCountry: "GB",
      department: null,
      employmentType: "FULL_TIME",
      weeklyEarnings: [
        { weekStartDate: new Date("2026-01-05T00:00:00.000Z"), isZeroPayWeek: false },
      ],
    },
    {
      id: "ng",
      name: "NG User",
      email: "ng@example.com",
      countryCode: "NG",
      workCountry: "NG",
      department: null,
      employmentType: "FULL_TIME",
      weeklyEarnings: [],
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "gb");
});

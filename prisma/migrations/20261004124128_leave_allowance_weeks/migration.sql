-- CreateEnum
CREATE TYPE "LeaveAllowanceUnit" AS ENUM ('DAYS', 'WEEKS');

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "allowanceUnit" "LeaveAllowanceUnit" NOT NULL DEFAULT 'DAYS';

-- UK statutory family leave is set in weeks of the person's working week,
-- not days. Convert seeded types still on their old default day counts (a
-- custom allowance someone changed is left alone). Old → new:
--   Paternity 14d → 2w, Parental bereavement 14d → 2w, Unpaid parental 18d →
--   4w a year (18w per child overall), Carer's 5d → 1w, Maternity 365d → 52w,
--   Adoption 365d → 52w, Shared parental 350d → 50w, Neonatal 60d → 12w.
CREATE TEMP TABLE "_weeks_conversion" (name TEXT, old_days INT, new_weeks INT);
INSERT INTO "_weeks_conversion" VALUES
  ('Statutory Paternity Leave', 14, 2),
  ('Parental Bereavement Leave', 14, 2),
  ('Unpaid Parental Leave', 18, 4),
  ('Carer''s Leave', 5, 1),
  ('Statutory Maternity Leave', 365, 52),
  ('Adoption Leave', 365, 52),
  ('Shared Parental Leave (SPL)', 350, 50),
  ('Neonatal Care Leave', 60, 12);

UPDATE "LeavePolicy" lp
SET "annualAllowance" = c.new_weeks
FROM "LeaveType" lt, "_weeks_conversion" c
WHERE lp."leaveTypeId" = lt.id
  AND lt.name = c.name
  AND lt."countryCode" = 'GB'
  AND lp."countryCode" = 'GB'
  AND lp."annualAllowance" = c.old_days;

UPDATE "LeaveType" lt
SET "allowanceUnit" = 'WEEKS', "defaultDays" = c.new_weeks
FROM "_weeks_conversion" c
WHERE lt.name = c.name
  AND lt."countryCode" = 'GB'
  AND lt."defaultDays" = c.old_days;

DROP TABLE "_weeks_conversion";

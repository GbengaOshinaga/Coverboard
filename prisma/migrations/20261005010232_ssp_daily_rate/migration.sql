-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "sspDailyRate" DECIMAL(8,2);

-- SSP is payable on the days someone normally works. qualifyingDaysPerWeek
-- was never set by the app (5 for everyone), so bring it in line with
-- daysWorkedPerWeek. Calculations now read days worked / the working pattern;
-- this keeps the stored field honest for display and subject access exports.
UPDATE "User"
SET "qualifyingDaysPerWeek" = LEAST(7, GREATEST(1, ROUND("daysWorkedPerWeek")))::int
WHERE "daysWorkedPerWeek" >= 1;

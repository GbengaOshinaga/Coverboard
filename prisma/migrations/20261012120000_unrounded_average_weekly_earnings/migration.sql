-- Average weekly earnings are kept unrounded (to 7 decimal places, as GOV.UK
-- shows them); statutory pay is then rounded up to the penny. Widening only:
-- existing values are unchanged until recalculated (npm run recalculate:ssp).
ALTER TABLE "User" ALTER COLUMN "averageWeeklyEarnings" SET DATA TYPE DECIMAL(13,7);
ALTER TABLE "LeaveRequest" ALTER COLUMN "sspAverageWeeklyEarnings" SET DATA TYPE DECIMAL(13,7);
ALTER TABLE "LeaveRequest" ALTER COLUMN "smpAverageWeeklyEarnings" SET DATA TYPE DECIMAL(13,7);

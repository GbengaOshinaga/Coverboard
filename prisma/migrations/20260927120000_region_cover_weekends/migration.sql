-- Per-region opt-in for enforcing minimum cover on weekends and bank holidays.
--
-- Existing regions are added with false so their cover checks keep the old
-- weekday-only behaviour; the column default is then switched to true so new
-- regions (shift-based teams) are checked every day.
ALTER TABLE "Region" ADD COLUMN "coverWeekends" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Region" ADD COLUMN "coverBankHolidays" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Region" ALTER COLUMN "coverWeekends" SET DEFAULT true;
ALTER TABLE "Region" ALTER COLUMN "coverBankHolidays" SET DEFAULT true;

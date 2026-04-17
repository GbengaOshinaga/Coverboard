-- AlterTable
ALTER TABLE "User"
    ADD COLUMN "qualifyingDaysPerWeek" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "averageWeeklyEarnings" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "LeaveRequest"
    ADD COLUMN "sspDaysPaid" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "sspLimitReached" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeaveRequest"
    ADD COLUMN "smpAverageWeeklyEarnings" DECIMAL(8,2),
    ADD COLUMN "smpPhase1EndDate" DATE,
    ADD COLUMN "smpPhase2EndDate" DATE,
    ADD COLUMN "smpPhase1WeeklyRate" DECIMAL(8,2),
    ADD COLUMN "smpPhase2WeeklyRate" DECIMAL(8,2);

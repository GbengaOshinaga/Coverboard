-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "leaveYearStartDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "leaveYearStartMonth" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN "dailyHolidayPayRate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "WeeklyEarning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "grossEarnings" DECIMAL(10,2) NOT NULL,
    "hoursWorked" DECIMAL(6,2) NOT NULL,
    "isZeroPayWeek" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyEarning_userId_weekStartDate_idx" ON "WeeklyEarning"("userId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyEarning_userId_weekStartDate_key" ON "WeeklyEarning"("userId", "weekStartDate");

-- AddForeignKey
ALTER TABLE "WeeklyEarning" ADD CONSTRAINT "WeeklyEarning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

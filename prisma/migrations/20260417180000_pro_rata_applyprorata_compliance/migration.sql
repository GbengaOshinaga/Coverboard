-- AlterTable: Organization — add full-time hours per week org setting
ALTER TABLE "Organization" ADD COLUMN "fullTimeHoursPerWeek" DECIMAL(4,1) NOT NULL DEFAULT 37.5;

-- AlterTable: User — add Bradford Factor score cache
ALTER TABLE "User" ADD COLUMN "bradfordScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: LeaveType — add applyProRata flag
ALTER TABLE "LeaveType" ADD COLUMN "applyProRata" BOOLEAN NOT NULL DEFAULT false;

-- Seed applyProRata = true for any leave type named "Annual Leave"
UPDATE "LeaveType" SET "applyProRata" = true WHERE "name" = 'Annual Leave';

-- AlterTable: LeaveRequest — add SPLIT days, sickness note (GDPR Art.9),
-- child birth date (paternity window), SPL curtailment flag
ALTER TABLE "LeaveRequest" ADD COLUMN "splitDaysUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaveRequest" ADD COLUMN "sicknessNote" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "childBirthDate" DATE;
ALTER TABLE "LeaveRequest" ADD COLUMN "splCurtailmentConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: User(organizationId, countryCode)
CREATE INDEX "User_organizationId_countryCode_idx" ON "User"("organizationId", "countryCode");

-- CreateIndex: LeaveRequest(userId, status)
CREATE INDEX "LeaveRequest_userId_status_idx" ON "LeaveRequest"("userId", "status");

-- CreateIndex: LeaveRequest(userId, leaveTypeId)
CREATE INDEX "LeaveRequest_userId_leaveTypeId_idx" ON "LeaveRequest"("userId", "leaveTypeId");

-- CreateIndex: BankHoliday(organizationId, date)
CREATE INDEX "BankHoliday_organizationId_date_idx" ON "BankHoliday"("organizationId", "date");

-- CreateIndex: LeaveCarryOverBalance(userId, leaveTypeId)
CREATE INDEX "LeaveCarryOverBalance_userId_leaveTypeId_idx" ON "LeaveCarryOverBalance"("userId", "leaveTypeId");

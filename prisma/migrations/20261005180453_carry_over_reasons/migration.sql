-- CreateEnum
CREATE TYPE "CarryOverReason" AS ENUM ('COMPANY_POLICY', 'SICKNESS', 'FAMILY_LEAVE');

-- DropIndex
DROP INDEX "LeaveCarryOverBalance_userId_leaveTypeId_idx";

-- DropIndex
DROP INDEX "LeaveCarryOverBalance_userId_leaveTypeId_leaveYear_key";

-- AlterTable
ALTER TABLE "LeaveCarryOverBalance" ADD COLUMN     "reason" "CarryOverReason" NOT NULL DEFAULT 'COMPANY_POLICY';

-- CreateIndex
CREATE INDEX "LeaveCarryOverBalance_userId_leaveTypeId_leaveYear_idx" ON "LeaveCarryOverBalance"("userId", "leaveTypeId", "leaveYear");

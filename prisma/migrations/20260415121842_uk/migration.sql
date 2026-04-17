-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'VARIABLE_HOURS');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('PAID', 'UNPAID', 'STATUTORY');

-- CreateEnum
CREATE TYPE "BankHolidayRegion" AS ENUM ('ENGLAND_WALES', 'SCOTLAND', 'NORTHERN_IRELAND');

-- CreateEnum
CREATE TYPE "DataResidency" AS ENUM ('UK', 'EU', 'US');

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "evidenceProvided" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kitDaysUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "category" "LeaveCategory" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "durationLogic" TEXT,
ADD COLUMN     "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiresEvidence" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "dataResidency" "DataResidency" NOT NULL DEFAULT 'EU',
ADD COLUMN     "maxAdminUsers" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "ukBankHolidayInclusive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ukBankHolidayRegion" "BankHolidayRegion" NOT NULL DEFAULT 'ENGLAND_WALES',
ADD COLUMN     "ukCarryOverEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ukCarryOverExpiryDay" INTEGER NOT NULL DEFAULT 31,
ADD COLUMN     "ukCarryOverExpiryMonth" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "ukCarryOverMax" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "daysWorkedPerWeek" DOUBLE PRECISION NOT NULL DEFAULT 5,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "digestOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "fteRatio" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "rightToWorkVerified" BOOLEAN,
ADD COLUMN     "serviceStartDate" TIMESTAMP(3),
ADD COLUMN     "ukParentalLeaveChildCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "JiraIntegration" (
    "id" TEXT NOT NULL,
    "cloudId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraUserMapping" (
    "id" TEXT NOT NULL,
    "jiraAccountId" TEXT NOT NULL,
    "jiraEmail" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraUserMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankHoliday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "region" "BankHolidayRegion" NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'GB',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWeeklyHours" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "hoursWorked" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWeeklyHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveCarryOverBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "leaveYear" INTEGER NOT NULL,
    "daysCarried" DOUBLE PRECISION NOT NULL,
    "daysRemaining" DOUBLE PRECISION NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveCarryOverBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JiraIntegration_organizationId_key" ON "JiraIntegration"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "JiraUserMapping_userId_key" ON "JiraUserMapping"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JiraUserMapping_userId_organizationId_key" ON "JiraUserMapping"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "BankHoliday_date_region_organizationId_key" ON "BankHoliday"("date", "region", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWeeklyHours_userId_weekStartDate_key" ON "UserWeeklyHours"("userId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveCarryOverBalance_userId_leaveTypeId_leaveYear_key" ON "LeaveCarryOverBalance"("userId", "leaveTypeId", "leaveYear");

-- AddForeignKey
ALTER TABLE "JiraIntegration" ADD CONSTRAINT "JiraIntegration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JiraIntegration" ADD CONSTRAINT "JiraIntegration_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JiraUserMapping" ADD CONSTRAINT "JiraUserMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JiraUserMapping" ADD CONSTRAINT "JiraUserMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankHoliday" ADD CONSTRAINT "BankHoliday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWeeklyHours" ADD CONSTRAINT "UserWeeklyHours_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveCarryOverBalance" ADD CONSTRAINT "LeaveCarryOverBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveCarryOverBalance" ADD CONSTRAINT "LeaveCarryOverBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

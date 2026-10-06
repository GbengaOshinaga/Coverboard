-- CreateEnum
CREATE TYPE "RightToWorkMethod" AS ENUM ('ONLINE_SHARE_CODE', 'MANUAL_DOCUMENTS', 'IDENTITY_SERVICE_PROVIDER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rightToWorkCheckedOn" DATE,
ADD COLUMN     "rightToWorkExpiresOn" DATE;

-- CreateTable
CREATE TABLE "RightToWorkCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkedOn" DATE NOT NULL,
    "method" "RightToWorkMethod" NOT NULL,
    "documentType" TEXT,
    "hasRightToWork" BOOLEAN NOT NULL,
    "expiresOn" DATE,
    "notes" TEXT,
    "checkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RightToWorkCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RightToWorkCheck_userId_checkedOn_idx" ON "RightToWorkCheck"("userId", "checkedOn");

-- AddForeignKey
ALTER TABLE "RightToWorkCheck" ADD CONSTRAINT "RightToWorkCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

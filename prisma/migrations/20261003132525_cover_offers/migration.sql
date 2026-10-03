-- CreateEnum
CREATE TYPE "CoverOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'FILLED');

-- CreateTable
CREATE TABLE "CoverOffer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shiftTypeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "offeredById" TEXT,
    "leaveRequestId" TEXT,
    "status" "CoverOfferStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoverOffer_organizationId_status_idx" ON "CoverOffer"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CoverOffer_shiftTypeId_date_idx" ON "CoverOffer"("shiftTypeId", "date");

-- CreateIndex
CREATE INDEX "CoverOffer_userId_status_idx" ON "CoverOffer"("userId", "status");

-- AddForeignKey
ALTER TABLE "CoverOffer" ADD CONSTRAINT "CoverOffer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverOffer" ADD CONSTRAINT "CoverOffer_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverOffer" ADD CONSTRAINT "CoverOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverOffer" ADD CONSTRAINT "CoverOffer_offeredById_fkey" FOREIGN KEY ("offeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverOffer" ADD CONSTRAINT "CoverOffer_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

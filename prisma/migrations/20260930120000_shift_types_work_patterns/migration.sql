-- Shift-aware cover (Phase 1): recurring shift types per region and each
-- member's recurring working pattern. Regions without shift types keep the
-- existing per-day minCover behaviour, so no backfill is needed.

CREATE TABLE "ShiftType" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "minCoverByWeekday" INTEGER[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkPattern" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shiftTypeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftType_regionId_name_key" ON "ShiftType"("regionId", "name");
CREATE INDEX "ShiftType_regionId_idx" ON "ShiftType"("regionId");
CREATE INDEX "WorkPattern_userId_idx" ON "WorkPattern"("userId");
CREATE INDEX "WorkPattern_shiftTypeId_weekday_idx" ON "WorkPattern"("shiftTypeId", "weekday");

ALTER TABLE "ShiftType" ADD CONSTRAINT "ShiftType_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPattern" ADD CONSTRAINT "WorkPattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPattern" ADD CONSTRAINT "WorkPattern_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

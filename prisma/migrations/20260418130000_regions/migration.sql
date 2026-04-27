-- Region: organization-scoped staffing region
CREATE TABLE "Region" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "description"    TEXT,
    "minCover"       INTEGER NOT NULL DEFAULT 1,
    "color"          TEXT,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Region_organizationId_name_key" ON "Region" ("organizationId", "name");
CREATE INDEX "Region_organizationId_isActive_idx" ON "Region" ("organizationId", "isActive");

ALTER TABLE "Region"
  ADD CONSTRAINT "Region_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- User: regionId nullable FK
ALTER TABLE "User"
  ADD COLUMN "regionId" TEXT;

CREATE INDEX "User_regionId_idx" ON "User" ("regionId");
CREATE INDEX "User_organizationId_regionId_idx" ON "User" ("organizationId", "regionId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "Region" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- UserRegionHistory: track region changes over time
CREATE TABLE "UserRegionHistory" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "regionId"    TEXT,
    "changedById" TEXT,
    "notes"       TEXT,
    "changedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRegionHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserRegionHistory_userId_changedAt_idx"
  ON "UserRegionHistory" ("userId", "changedAt");
CREATE INDEX "UserRegionHistory_regionId_changedAt_idx"
  ON "UserRegionHistory" ("regionId", "changedAt");

ALTER TABLE "UserRegionHistory"
  ADD CONSTRAINT "UserRegionHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRegionHistory"
  ADD CONSTRAINT "UserRegionHistory_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "Region" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserRegionHistory"
  ADD CONSTRAINT "UserRegionHistory_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- LeaveRequest: cover override tracking
ALTER TABLE "LeaveRequest"
  ADD COLUMN "coverOverride"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "coverOverrideById" TEXT,
  ADD COLUMN "coverOverrideAt"   TIMESTAMP(3);

CREATE INDEX "LeaveRequest_status_startDate_endDate_idx"
  ON "LeaveRequest" ("status", "startDate", "endDate");

ALTER TABLE "LeaveRequest"
  ADD CONSTRAINT "LeaveRequest_coverOverrideById_fkey"
  FOREIGN KEY ("coverOverrideById") REFERENCES "User" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

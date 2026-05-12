-- Add employee work location and active flag
ALTER TABLE "User"
ADD COLUMN "workCountry" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Match Prisma schema index after adding the columns
CREATE INDEX "User_organizationId_workCountry_isActive_idx"
ON "User" ("organizationId", "workCountry", "isActive");

-- Fast lookup for UK workforce checks on active users
CREATE INDEX "idx_users_work_country_active"
ON "User" ("organizationId", "workCountry")
WHERE "isActive" = true;

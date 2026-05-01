-- Add employee work location and active flag
ALTER TABLE "User"
ADD COLUMN "workCountry" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Fast lookup for UK workforce checks on active users
CREATE INDEX "idx_users_work_country_active"
ON "User" ("organizationId", "workCountry")
WHERE "isActive" = true;

-- Add regions feature flag and industry field to Organization.
-- Default false ensures existing orgs are unaffected until they opt in.
ALTER TABLE "Organization"
  ADD COLUMN "regionsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "industry" TEXT;

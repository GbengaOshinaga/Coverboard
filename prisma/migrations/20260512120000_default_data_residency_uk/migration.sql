-- Switch the dataResidency default from EU to UK. Current physical storage is
-- UK regardless of this metadata field, so the previous default left newly
-- signed-up orgs with a value that misrepresented reality.
ALTER TABLE "Organization" ALTER COLUMN "dataResidency" SET DEFAULT 'UK';

-- Bulk-update existing orgs still on the old default. Same reasoning: their
-- data is physically in the UK, so the field should reflect that. Orgs that
-- explicitly set UK or US are untouched.
UPDATE "Organization" SET "dataResidency" = 'UK' WHERE "dataResidency" = 'EU';

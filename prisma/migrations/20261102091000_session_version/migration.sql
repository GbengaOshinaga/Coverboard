-- Goes up when a password is changed or reset, ending sessions signed in
-- before then (src/lib/auth.ts). Existing sessions carry no version and
-- count as 0, so nobody is signed out by this migration.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
